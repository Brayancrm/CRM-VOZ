import { listContacts } from '@/db/repositories/contacts';
import { createNote } from '@/db/repositories/notes';
import {
  createScheduledCall,
  getScheduledById,
  rescheduleScheduledCall,
} from '@/db/repositories/scheduledCalls';
import {
  interpretCommandWithOpenAi,
  type AiAction,
  type AiActionReschedule,
  type AiActionSchedule,
} from '@/services/openaiInterpret';
import {
  cancelScheduleVoice,
  findScheduleCandidates,
  listAgendaVoice,
  rescheduleVoice,
  speakAmbiguousSchedules,
} from '@/services/secretinaAgendaVoice';
import { scheduleCallReminders } from '@/services/notifications';
import {
  coerceCreateScheduleActions,
  findMissingSlot,
  mergeSlotFill,
  questionForMissingSlot,
  type MissingSlot,
  type PendingCommandDraft,
} from '@/services/secretinaDraft';
import {
  getSecretinaLanguage,
  type SecretinaLanguage,
} from '@/services/secretinaLanguage';
import {
  msgBadDateTime,
  msgContactChosenMissing,
  msgContactNotFound,
  msgDateInPast,
  msgNoAction,
  msgNoCommand,
  msgNoteCreated,
  msgRescheduleNeedWhen,
  msgRescheduleNotFound,
  msgScheduleNotFound,
  msgScheduleNotFoundShort,
  msgEmptyNote,
  msgScheduled,
} from '@/services/secretinaSpeak';
import { createId } from '@/utils/id';
import {
  matchContactBySpokenName,
  parseSecretinaCommand,
} from '@/utils/secretinaCommand';
import { parseSpokenDateTime } from '@/utils/spokenDateTime';
import {
  buildAmbiguousScreenMessage,
  buildAmbiguousSpeakMessage,
} from '@/utils/contactChoice';
import type { Contact, ScheduledCallWithContact } from '@/types';
import type { AgendaVoiceItem } from '@/services/secretinaAgendaVoice';

export type { MissingSlot, PendingCommandDraft };

export type AssistantSuccess = {
  ok: true;
  contact?: Contact;
  noteId?: string;
  scheduledId?: string;
  noteBody?: string;
  scheduledAt?: number;
  kind: 'note' | 'schedule' | 'mixed' | 'list' | 'cancel' | 'reschedule';
  spokenText: string;
  message: string;
  /** Só pede nota extra se o agendamento foi criado sem texto. */
  askScheduleNote?: boolean;
  agendaItems?: AgendaVoiceItem[];
};

export type AssistantFailure = {
  ok: false;
  spokenText: string;
  message: string;
  speakMessage?: string;
  ambiguous?: Contact[];
  /** Agendamentos ambíguos (cancelar/remarcar) — escolha por número. */
  ambiguousSchedules?: ScheduledCallWithContact[];
  pendingText?: string;
  /** Acções a reexecutar após escolha de contacto/agenda ou preenchimento de slot. */
  pendingActions?: AiAction[];
  pendingReply?: string;
  /** Pedido parcial: falta só um campo; o mic reabre para preencher. */
  needSlot?: PendingCommandDraft;
};

export type AssistantResult = AssistantSuccess | AssistantFailure;

export type RunCommandOptions = {
  contactId?: string;
  scheduledId?: string;
  /** Reexecuta rascunho já interpretado (após escolha de contacto / slot). */
  draftActions?: AiAction[];
  draftReply?: string;
};

function resolveContact(
  query: string,
  contacts: Contact[],
  lang: SecretinaLanguage,
  contactId?: string
):
  | { ok: true; contact: Contact }
  | { ok: false; result: AssistantFailure } {
  if (contactId) {
    const c = contacts.find((x) => x.id === contactId);
    if (!c) {
      return {
        ok: false,
        result: {
          ok: false,
          spokenText: query,
          message: msgContactChosenMissing(lang),
        },
      };
    }
    return { ok: true, contact: c };
  }

  const match = matchContactBySpokenName(query, contacts);
  if (match.status === 'none') {
    return {
      ok: false,
      result: {
        ok: false,
        spokenText: query,
        message: msgContactNotFound(lang, query),
      },
    };
  }
  if (match.status === 'ambiguous') {
    const ambiguousContacts = match.candidates
      .map((c) => contacts.find((x) => x.id === c.id))
      .filter((c): c is Contact => !!c);
    return {
      ok: false,
      result: {
        ok: false,
        spokenText: query,
        message: buildAmbiguousScreenMessage(ambiguousContacts, lang),
        speakMessage: buildAmbiguousSpeakMessage(ambiguousContacts, lang),
        ambiguous: ambiguousContacts,
        pendingText: query,
      },
    };
  }

  const contact =
    contacts.find((c) => c.id === match.contact!.id) ??
    ({
      id: match.contact!.id,
      name: match.contact!.name,
      phone_normalized: '',
      created_at: 0,
    } as Contact);

  return { ok: true, contact };
}

async function createNoteAction(
  contact: Contact,
  noteBody: string
): Promise<{ noteId: string; noteBody: string }> {
  const noteId = createId();
  await createNote({
    id: noteId,
    contact_id: contact.id,
    call_session_id: null,
    body: noteBody,
    source: 'voice',
    created_at: Date.now(),
  });
  return { noteId, noteBody };
}

async function createScheduleAction(
  contact: Contact,
  atMs: number,
  note: string
): Promise<{ scheduledId: string; scheduledAt: number }> {
  const scheduledId = createId();
  await createScheduledCall({
    id: scheduledId,
    contact_id: contact.id,
    scheduled_at: atMs,
    note: note.trim(),
    completed: 0,
    notified_1h: 0,
    notified_5m: 0,
  });
  try {
    await scheduleCallReminders(scheduledId, contact.name, atMs);
  } catch (e) {
    console.warn('SeCretina: lembretes do agendamento por voz', e);
  }
  return { scheduledId, scheduledAt: atMs };
}

function resolveWhenMs(
  action: Pick<AiActionSchedule | AiActionReschedule, 'whenIso' | 'whenRaw'>
): number | null {
  if (action.whenIso) {
    const t = Date.parse(action.whenIso);
    if (!Number.isNaN(t)) return t;
  }
  if (action.whenRaw) {
    const d = parseSpokenDateTime(action.whenRaw);
    if (d) return d.getTime();
  }
  return null;
}

async function runListAgenda(
  spokenText: string,
  action: Extract<AiAction, { type: 'list_agenda' }>,
  reply: string,
  lang: SecretinaLanguage
): Promise<AssistantResult> {
  const listed = await listAgendaVoice({
    whenRaw: action.whenRaw || spokenText,
    contactQuery: action.contactQuery,
    searchText: action.searchText || spokenText,
    lang,
  });
  return {
    ok: true,
    kind: 'list',
    spokenText,
    message: reply.trim() || listed.message,
    agendaItems: listed.items,
  };
}

function needSlotFailure(
  spokenText: string,
  actions: AiAction[],
  missing: MissingSlot,
  lang: SecretinaLanguage,
  clarification?: string,
  reply?: string
): AssistantFailure {
  const question = questionForMissingSlot(missing, lang, clarification);
  return {
    ok: false,
    spokenText,
    message: question,
    speakMessage: question,
    needSlot: {
      originalText: spokenText,
      actions,
      missing,
      question,
      reply,
    },
  };
}

async function runCancelSchedule(
  spokenText: string,
  action: Extract<AiAction, { type: 'cancel_schedule' }>,
  reply: string,
  lang: SecretinaLanguage,
  options?: RunCommandOptions
): Promise<AssistantResult> {
  let target: ScheduledCallWithContact | undefined;

  if (options?.scheduledId) {
    const broad = await findScheduleCandidates({
      contactQuery: action.contactQuery,
    });
    target = broad.find((c) => c.id === options.scheduledId);
    if (!target) {
      const wider = await findScheduleCandidates({});
      target = wider.find((c) => c.id === options.scheduledId);
    }
  }

  if (!target) {
    const candidates = await findScheduleCandidates({
      contactQuery: action.contactQuery,
      whenRaw: action.whenRaw,
    });
    if (candidates.length === 0) {
      return {
        ok: false,
        spokenText,
        message: msgScheduleNotFound(lang),
      };
    }
    if (candidates.length > 1) {
      const amb = speakAmbiguousSchedules(candidates, lang);
      return {
        ok: false,
        spokenText,
        message: amb,
        speakMessage: amb,
        ambiguousSchedules: candidates.slice(0, 8),
        pendingText: spokenText,
        pendingActions: [action],
        pendingReply: reply,
      };
    }
    target = candidates[0];
  }

  const msg = await cancelScheduleVoice(target, lang);
  return {
    ok: true,
    kind: 'cancel',
    contact: {
      id: target.contact_id,
      name: target.contact_name,
      phone_normalized: target.phone_normalized,
      created_at: 0,
    },
    scheduledId: target.id,
    spokenText,
    message: reply.trim() || msg,
  };
}

async function runReschedule(
  spokenText: string,
  action: AiActionReschedule,
  reply: string,
  lang: SecretinaLanguage,
  options?: RunCommandOptions
): Promise<AssistantResult> {
  const newAt = resolveWhenMs(action);
  if (newAt == null) {
    return needSlotFailure(
      spokenText,
      [action],
      'new_when',
      lang,
      msgRescheduleNeedWhen(lang),
      reply
    );
  }
  if (newAt < Date.now() + 60_000) {
    return {
      ok: false,
      spokenText,
      message: msgDateInPast(lang),
    };
  }

  let target: ScheduledCallWithContact | undefined;
  if (options?.scheduledId) {
    const broad = await findScheduleCandidates({
      contactQuery: action.contactQuery,
      whenRaw: action.fromWhenRaw,
    });
    target = broad.find((c) => c.id === options.scheduledId);
    if (!target) {
      const wider = await findScheduleCandidates({
        contactQuery: action.contactQuery,
      });
      target = wider.find((c) => c.id === options.scheduledId);
    }
  }

  if (!target) {
    const candidates = await findScheduleCandidates({
      contactQuery: action.contactQuery,
      whenRaw: action.fromWhenRaw,
    });
    if (candidates.length === 0) {
      return {
        ok: false,
        spokenText,
        message: msgRescheduleNotFound(lang),
      };
    }
    if (candidates.length > 1) {
      const amb = speakAmbiguousSchedules(candidates, lang);
      return {
        ok: false,
        spokenText,
        message: amb,
        speakMessage: amb,
        ambiguousSchedules: candidates.slice(0, 8),
        pendingText: spokenText,
        pendingActions: [action],
        pendingReply: reply,
      };
    }
    target = candidates[0];
  }

  const msg = await rescheduleVoice(target, newAt, lang);
  return {
    ok: true,
    kind: 'reschedule',
    contact: {
      id: target.contact_id,
      name: target.contact_name,
      phone_normalized: target.phone_normalized,
      created_at: 0,
    },
    scheduledId: target.id,
    scheduledAt: newAt,
    spokenText,
    message: reply.trim() || msg,
  };
}

async function runAiActions(
  spokenText: string,
  actions: AiAction[],
  reply: string,
  lang: SecretinaLanguage,
  options?: RunCommandOptions,
  clarification?: string
): Promise<AssistantResult> {
  const missing = findMissingSlot(actions);
  if (missing) {
    return needSlotFailure(
      spokenText,
      actions,
      missing,
      lang,
      clarification,
      reply
    );
  }

  const list = actions.find((a) => a.type === 'list_agenda');
  if (list && list.type === 'list_agenda') {
    return runListAgenda(spokenText, list, reply, lang);
  }
  const cancel = actions.find((a) => a.type === 'cancel_schedule');
  if (cancel && cancel.type === 'cancel_schedule') {
    return runCancelSchedule(spokenText, cancel, reply, lang, options);
  }
  const move = actions.find((a) => a.type === 'reschedule');
  if (move && move.type === 'reschedule') {
    return runReschedule(spokenText, move, reply, lang, options);
  }

  const contacts = await listContacts();
  const messages: string[] = [];
  let lastContact: Contact | null = null;
  let noteId: string | undefined;
  let noteBody: string | undefined;
  let scheduledId: string | undefined;
  let scheduledAt: number | undefined;
  let didNote = false;
  let didSchedule = false;
  let scheduleHadNote = false;

  for (const action of actions) {
    if (action.type !== 'note' && action.type !== 'schedule') continue;

    const resolved = resolveContact(
      action.contactQuery,
      contacts,
      lang,
      options?.contactId
    );
    if (!resolved.ok) {
      return {
        ...resolved.result,
        spokenText,
        pendingText: spokenText,
        pendingActions: actions,
        pendingReply: reply,
      };
    }
    const contact = resolved.contact;
    lastContact = contact;

    if (action.type === 'note') {
      if (!action.noteBody?.trim()) {
        return needSlotFailure(
          spokenText,
          actions,
          'note_body',
          lang,
          clarification,
          reply
        );
      }
      const created = await createNoteAction(contact, action.noteBody.trim());
      noteId = created.noteId;
      noteBody = created.noteBody;
      didNote = true;
      messages.push(msgNoteCreated(lang, contact.name).replace(/\.$/, ''));
    } else {
      const atMs = resolveWhenMs(action);
      if (atMs == null) {
        return needSlotFailure(
          spokenText,
          actions,
          'when',
          lang,
          clarification,
          reply
        );
      }
      if (atMs < Date.now() + 60_000) {
        return {
          ok: false,
          spokenText,
          message: msgDateInPast(lang),
        };
      }
      const scheduleNote = (action.note ?? '').trim();
      scheduleHadNote = scheduleNote.length > 0;
      const created = await createScheduleAction(contact, atMs, scheduleNote);
      scheduledId = created.scheduledId;
      scheduledAt = created.scheduledAt;
      didSchedule = true;
      messages.push(
        msgScheduled(lang, contact.name, atMs).replace(/\.$/, '')
      );
    }
  }

  if (!lastContact) {
    return {
      ok: false,
      spokenText,
      message: reply || msgNoAction(lang),
    };
  }

  const kind: AssistantSuccess['kind'] =
    didNote && didSchedule ? 'mixed' : didSchedule ? 'schedule' : 'note';

  return {
    ok: true,
    kind,
    contact: lastContact,
    noteId,
    noteBody: didNote
      ? noteBody
      : scheduleHadNote
        ? (actions.find((a) => a.type === 'schedule' && a.note?.trim()) as
            | AiActionSchedule
            | undefined)?.note?.trim()
        : undefined,
    scheduledId,
    scheduledAt,
    spokenText,
    message: reply.trim() || messages.join('. ') + '.',
    askScheduleNote: kind === 'schedule' && !scheduleHadNote,
  };
}

/** Executa o comando falado: IA (se configurada) ou parser local. */
export async function runSecretinaVoiceCommand(
  spokenText: string,
  options?: RunCommandOptions
): Promise<AssistantResult> {
  const lang = await getSecretinaLanguage();
  const trimmed = spokenText.trim();
  if (!trimmed) {
    return {
      ok: false,
      spokenText,
      message: msgNoCommand(lang),
    };
  }

  if (options?.draftActions && options.draftActions.length > 0) {
    return runAiActions(
      trimmed,
      options.draftActions,
      options.draftReply ?? '',
      lang,
      options
    );
  }

  try {
    const ai = await interpretCommandWithOpenAi(trimmed);
    if (ai) {
      if (ai.actions.length > 0) {
        const actions = coerceCreateScheduleActions(trimmed, ai.actions);
        return runAiActions(
          trimmed,
          actions,
          ai.reply,
          lang,
          options,
          ai.clarification
        );
      }
      if (ai.clarification) {
        return {
          ok: false,
          spokenText: trimmed,
          message: ai.clarification,
        };
      }
      if (ai.reply) {
        return {
          ok: false,
          spokenText: trimmed,
          message: ai.reply,
        };
      }
    }
  } catch (e) {
    console.warn('SeCretina OpenAI interpret fallback', e);
  }

  const parsed = parseSecretinaCommand(trimmed, lang);

  if (parsed.type === 'unknown') {
    return {
      ok: false,
      spokenText: trimmed,
      message: parsed.reason,
    };
  }

  if (parsed.type === 'list_agenda') {
    return runListAgenda(
      trimmed,
      {
        type: 'list_agenda',
        contactQuery: parsed.contactQuery,
        whenRaw: parsed.whenRaw,
        searchText: trimmed,
      },
      '',
      lang
    );
  }

  if (parsed.type === 'cancel_schedule') {
    return runCancelSchedule(
      trimmed,
      {
        type: 'cancel_schedule',
        contactQuery: parsed.contactQuery,
        whenRaw: parsed.whenRaw,
      },
      '',
      lang,
      options
    );
  }

  if (parsed.type === 'reschedule') {
    return runReschedule(
      trimmed,
      {
        type: 'reschedule',
        contactQuery: parsed.contactQuery,
        fromWhenRaw: parsed.fromWhenRaw,
        whenRaw: parsed.whenRaw,
      },
      '',
      lang,
      options
    );
  }

  const contacts = await listContacts();
  const resolved = resolveContact(
    parsed.contactQuery,
    contacts,
    lang,
    options?.contactId
  );
  if (!resolved.ok) {
    return {
      ...resolved.result,
      spokenText: trimmed,
      pendingText: trimmed,
    };
  }
  const contact = resolved.contact;

  if (parsed.type === 'note') {
    if (!parsed.noteBody.trim()) {
      return needSlotFailure(
        trimmed,
        [
          {
            type: 'note',
            contactQuery: parsed.contactQuery,
            noteBody: '',
          },
        ],
        'note_body',
        lang
      );
    }
    const created = await createNoteAction(contact, parsed.noteBody);
    return {
      ok: true,
      kind: 'note',
      contact,
      noteId: created.noteId,
      noteBody: created.noteBody,
      spokenText: trimmed,
      message: msgNoteCreated(lang, contact.name),
    };
  }

  const at = parseSpokenDateTime(parsed.whenRaw);
  if (!at) {
    return needSlotFailure(
      trimmed,
      [
        {
          type: 'schedule',
          contactQuery: parsed.contactQuery,
          whenRaw: parsed.whenRaw || undefined,
        },
      ],
      'when',
      lang
    );
  }
  const atMs = at.getTime();
  if (atMs < Date.now() + 60_000) {
    return {
      ok: false,
      spokenText: trimmed,
      message: msgDateInPast(lang),
    };
  }

  const created = await createScheduleAction(contact, atMs, '');
  return {
    ok: true,
    kind: 'schedule',
    contact,
    scheduledId: created.scheduledId,
    scheduledAt: created.scheduledAt,
    spokenText: trimmed,
    message: msgScheduled(lang, contact.name, atMs),
    askScheduleNote: true,
  };
}

/** Preenche só o campo em falta e reexecuta o rascunho. */
export async function runSecretinaSlotFill(
  draft: PendingCommandDraft,
  fillText: string,
  options?: RunCommandOptions
): Promise<AssistantResult> {
  const lang = await getSecretinaLanguage();
  const fill = fillText.trim();
  if (!fill) {
    return needSlotFailure(
      draft.originalText,
      draft.actions,
      draft.missing,
      lang,
      draft.question,
      draft.reply
    );
  }

  const merged = mergeSlotFill(draft.actions, draft.missing, fill);
  return runAiActions(
    draft.originalText,
    merged,
    draft.reply ?? '',
    lang,
    options
  );
}

export async function updateScheduledCallNote(
  scheduledId: string,
  note: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const lang = await getSecretinaLanguage();
  const current = await getScheduledById(scheduledId);
  if (!current) {
    return { ok: false, message: msgScheduleNotFoundShort(lang) };
  }
  const body = note.trim();
  if (!body) {
    return { ok: false, message: msgEmptyNote(lang) };
  }
  await rescheduleScheduledCall(scheduledId, {
    scheduled_at: current.scheduled_at,
    note: body,
  });
  return { ok: true };
}
