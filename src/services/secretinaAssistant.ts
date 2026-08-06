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
  getSecretinaLanguage,
  type SecretinaLanguage,
} from '@/services/secretinaLanguage';
import {
  msgBadDateTime,
  msgContactChosenMissing,
  msgContactNotFound,
  msgDateInPast,
  msgMissingNote,
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
import type { Contact } from '@/types';
import type { AgendaVoiceItem } from '@/services/secretinaAgendaVoice';

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
  askScheduleNote?: boolean;
  agendaItems?: AgendaVoiceItem[];
};

export type AssistantFailure = {
  ok: false;
  spokenText: string;
  message: string;
  speakMessage?: string;
  ambiguous?: Contact[];
  pendingText?: string;
};

export type AssistantResult = AssistantSuccess | AssistantFailure;

export type RunCommandOptions = {
  contactId?: string;
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

async function runCancelSchedule(
  spokenText: string,
  action: Extract<AiAction, { type: 'cancel_schedule' }>,
  reply: string,
  lang: SecretinaLanguage
): Promise<AssistantResult> {
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
    };
  }
  const msg = await cancelScheduleVoice(candidates[0], lang);
  return {
    ok: true,
    kind: 'cancel',
    contact: {
      id: candidates[0].contact_id,
      name: candidates[0].contact_name,
      phone_normalized: candidates[0].phone_normalized,
      created_at: 0,
    },
    scheduledId: candidates[0].id,
    spokenText,
    message: reply.trim() || msg,
  };
}

async function runReschedule(
  spokenText: string,
  action: AiActionReschedule,
  reply: string,
  lang: SecretinaLanguage
): Promise<AssistantResult> {
  const newAt = resolveWhenMs(action);
  if (newAt == null) {
    return {
      ok: false,
      spokenText,
      message: msgRescheduleNeedWhen(lang),
    };
  }
  if (newAt < Date.now() + 60_000) {
    return {
      ok: false,
      spokenText,
      message: msgDateInPast(lang),
    };
  }

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
    };
  }

  const msg = await rescheduleVoice(candidates[0], newAt, lang);
  return {
    ok: true,
    kind: 'reschedule',
    contact: {
      id: candidates[0].contact_id,
      name: candidates[0].contact_name,
      phone_normalized: candidates[0].phone_normalized,
      created_at: 0,
    },
    scheduledId: candidates[0].id,
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
  options?: RunCommandOptions
): Promise<AssistantResult> {
  const list = actions.find((a) => a.type === 'list_agenda');
  if (list && list.type === 'list_agenda') {
    return runListAgenda(spokenText, list, reply, lang);
  }
  const cancel = actions.find((a) => a.type === 'cancel_schedule');
  if (cancel && cancel.type === 'cancel_schedule') {
    return runCancelSchedule(spokenText, cancel, reply, lang);
  }
  const move = actions.find((a) => a.type === 'reschedule');
  if (move && move.type === 'reschedule') {
    return runReschedule(spokenText, move, reply, lang);
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
      };
    }
    const contact = resolved.contact;
    lastContact = contact;

    if (action.type === 'note') {
      if (!action.noteBody?.trim()) {
        return {
          ok: false,
          spokenText,
          message: msgMissingNote(lang),
        };
      }
      const created = await createNoteAction(contact, action.noteBody.trim());
      noteId = created.noteId;
      noteBody = created.noteBody;
      didNote = true;
      messages.push(msgNoteCreated(lang, contact.name).replace(/\.$/, ''));
    } else {
      const atMs = resolveWhenMs(action);
      if (atMs == null) {
        return {
          ok: false,
          spokenText,
          message: msgBadDateTime(lang),
        };
      }
      if (atMs < Date.now() + 60_000) {
        return {
          ok: false,
          spokenText,
          message: msgDateInPast(lang),
        };
      }
      const scheduleNote = (action.note ?? '').trim();
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
    noteBody: didNote ? noteBody : undefined,
    scheduledId,
    scheduledAt,
    spokenText,
    message: reply.trim() || messages.join('. ') + '.',
    askScheduleNote: kind === 'schedule',
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

  try {
    const ai = await interpretCommandWithOpenAi(trimmed);
    if (ai) {
      if (ai.clarification && ai.actions.length === 0) {
        return {
          ok: false,
          spokenText: trimmed,
          message: ai.clarification,
        };
      }
      if (ai.actions.length > 0) {
        return runAiActions(trimmed, ai.actions, ai.reply, lang, options);
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
      lang
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
      lang
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
      return {
        ok: false,
        spokenText: trimmed,
        message: msgMissingNote(lang),
      };
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
    return {
      ok: false,
      spokenText: trimmed,
      message: msgBadDateTime(lang),
    };
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
