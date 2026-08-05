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
  type AgendaVoiceItem,
} from '@/services/secretinaAgendaVoice';
import { scheduleCallReminders } from '@/services/notifications';
import { createId } from '@/utils/id';
import { formatDateTime } from '@/utils/date';
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
          message: 'Contacto escolhido não encontrado.',
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
        message: `Não encontrei o contacto «${query}». Cadastre o nome ou diga o nome completo.`,
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
        message: buildAmbiguousScreenMessage(ambiguousContacts),
        speakMessage: buildAmbiguousSpeakMessage(ambiguousContacts),
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
  reply: string
): Promise<AssistantResult> {
  const listed = await listAgendaVoice({
    whenRaw: action.whenRaw || spokenText,
    contactQuery: action.contactQuery,
    searchText: action.searchText || spokenText,
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
  reply: string
): Promise<AssistantResult> {
  const candidates = await findScheduleCandidates({
    contactQuery: action.contactQuery,
    whenRaw: action.whenRaw,
  });
  if (candidates.length === 0) {
    return {
      ok: false,
      spokenText,
      message:
        'Não encontrei esse agendamento. Diga o nome e o dia, por exemplo «cancela o com a Maria amanhã».',
    };
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      spokenText,
      message: speakAmbiguousSchedules(candidates),
      speakMessage: speakAmbiguousSchedules(candidates),
    };
  }
  const msg = await cancelScheduleVoice(candidates[0]);
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
  reply: string
): Promise<AssistantResult> {
  const newAt = resolveWhenMs(action);
  if (newAt == null) {
    return {
      ok: false,
      spokenText,
      message:
        'Para remarcar diga a nova data e hora. Ex.: «move o do Paulo para quinta às 10».',
    };
  }
  if (newAt < Date.now() + 60_000) {
    return {
      ok: false,
      spokenText,
      message: 'A nova data/hora ficou no passado. Diga um horário futuro.',
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
      message:
        'Não encontrei o agendamento para remarcar. Diga o contacto e, se puder, o dia actual.',
    };
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      spokenText,
      message: speakAmbiguousSchedules(candidates),
      speakMessage: speakAmbiguousSchedules(candidates),
    };
  }

  const msg = await rescheduleVoice(candidates[0], newAt);
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
  options?: RunCommandOptions
): Promise<AssistantResult> {
  // Acções de agenda rica: uma de cada vez (prioridade)
  const list = actions.find((a) => a.type === 'list_agenda');
  if (list && list.type === 'list_agenda') {
    return runListAgenda(spokenText, list, reply);
  }
  const cancel = actions.find((a) => a.type === 'cancel_schedule');
  if (cancel && cancel.type === 'cancel_schedule') {
    return runCancelSchedule(spokenText, cancel, reply);
  }
  const move = actions.find((a) => a.type === 'reschedule');
  if (move && move.type === 'reschedule') {
    return runReschedule(spokenText, move, reply);
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
          message: 'Falta o texto da nota.',
        };
      }
      const created = await createNoteAction(contact, action.noteBody.trim());
      noteId = created.noteId;
      noteBody = created.noteBody;
      didNote = true;
      messages.push(`Nota criada para ${contact.name}`);
    } else {
      const atMs = resolveWhenMs(action);
      if (atMs == null) {
        return {
          ok: false,
          spokenText,
          message:
            'Não consegui interpretar a data/hora. Tente «amanhã às 15» ou uma data completa.',
        };
      }
      if (atMs < Date.now() + 60_000) {
        return {
          ok: false,
          spokenText,
          message: 'A data/hora ficou no passado. Diga um horário futuro.',
        };
      }
      const scheduleNote = (action.note ?? '').trim();
      const created = await createScheduleAction(contact, atMs, scheduleNote);
      scheduledId = created.scheduledId;
      scheduledAt = created.scheduledAt;
      didSchedule = true;
      messages.push(
        `Agendei ligação com ${contact.name} para ${formatDateTime(atMs)}`
      );
    }
  }

  if (!lastContact) {
    return {
      ok: false,
      spokenText,
      message: reply || 'Não identifiquei nenhuma acção.',
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
  const trimmed = spokenText.trim();
  if (!trimmed) {
    return {
      ok: false,
      spokenText,
      message: 'Não ouvi nenhum comando.',
    };
  }

  // 1) OpenAI
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
        return runAiActions(trimmed, ai.actions, ai.reply, options);
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

  // 2) Parser local
  const parsed = parseSecretinaCommand(trimmed);

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
      ''
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
      ''
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
      ''
    );
  }

  const contacts = await listContacts();
  const resolved = resolveContact(
    parsed.contactQuery,
    contacts,
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
        message:
          'Falta o texto da nota. Ex.: «cria uma nota para o Paulo dizendo que…».',
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
      message: `Nota criada para ${contact.name}.`,
    };
  }

  const at = parseSpokenDateTime(parsed.whenRaw);
  if (!at) {
    return {
      ok: false,
      spokenText: trimmed,
      message:
        'Não consegui interpretar a data/hora. Tente «amanhã às 15» ou «quinta às 10».',
    };
  }
  const atMs = at.getTime();
  if (atMs < Date.now() + 60_000) {
    return {
      ok: false,
      spokenText: trimmed,
      message:
        'A data/hora ficou no passado. Diga um horário futuro, por exemplo «amanhã às 15».',
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
    message: `Agendei ligação com ${contact.name} para ${formatDateTime(atMs)}.`,
    askScheduleNote: true,
  };
}

export async function updateScheduledCallNote(
  scheduledId: string,
  note: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const current = await getScheduledById(scheduledId);
  if (!current) {
    return { ok: false, message: 'Agendamento não encontrado.' };
  }
  const body = note.trim();
  if (!body) {
    return { ok: false, message: 'A nota ficou vazia.' };
  }
  await rescheduleScheduledCall(scheduledId, {
    scheduled_at: current.scheduled_at,
    note: body,
  });
  return { ok: true };
}
