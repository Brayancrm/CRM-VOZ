import { listContacts } from '@/db/repositories/contacts';
import { createNote } from '@/db/repositories/notes';
import {
  createScheduledCall,
  getScheduledById,
  rescheduleScheduledCall,
} from '@/db/repositories/scheduledCalls';
import {
  interpretCommandWithOpenAi,
  type AiActionNote,
  type AiActionSchedule,
} from '@/services/openaiInterpret';
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
  contact: Contact;
  noteId?: string;
  scheduledId?: string;
  noteBody?: string;
  scheduledAt?: number;
  kind: 'note' | 'schedule' | 'mixed';
  spokenText: string;
  message: string;
};

export type AssistantFailure = {
  ok: false;
  spokenText: string;
  message: string;
  /** Texto curto/enumerado para TTS. */
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

function resolveWhenMs(action: AiActionSchedule): number | null {
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

async function runAiActions(
  spokenText: string,
  actions: Array<AiActionNote | AiActionSchedule>,
  reply: string,
  options?: RunCommandOptions
): Promise<AssistantResult> {
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
      const created = await createScheduleAction(
        contact,
        atMs,
        action.note ?? ''
      );
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
    noteBody,
    scheduledId,
    scheduledAt,
    spokenText,
    message: reply.trim() || messages.join('. ') + '.',
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
