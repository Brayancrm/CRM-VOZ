import { listContacts } from '@/db/repositories/contacts';
import {
  getOpenAiProxyBaseUrl,
  openAiProxyAuthHeaders,
} from '@/services/openaiProxy';
import { formatDateTime } from '@/utils/date';
import { getSecretinaLanguage } from '@/services/secretinaLanguage';

export type AiActionNote = {
  type: 'note';
  contactQuery: string;
  noteBody: string;
};

export type AiActionSchedule = {
  type: 'schedule';
  contactQuery: string;
  whenIso?: string;
  whenRaw?: string;
  note?: string;
};

export type AiActionListAgenda = {
  type: 'list_agenda';
  contactQuery?: string;
  whenRaw?: string;
  searchText?: string;
};

export type AiActionCancelSchedule = {
  type: 'cancel_schedule';
  contactQuery?: string;
  whenRaw?: string;
};

export type AiActionReschedule = {
  type: 'reschedule';
  contactQuery?: string;
  fromWhenRaw?: string;
  whenIso?: string;
  whenRaw?: string;
};

export type AiAction =
  | AiActionNote
  | AiActionSchedule
  | AiActionListAgenda
  | AiActionCancelSchedule
  | AiActionReschedule;

const ACTION_TYPES = new Set([
  'note',
  'schedule',
  'list_agenda',
  'cancel_schedule',
  'reschedule',
]);

export type AiInterpretedCommand = {
  actions: AiAction[];
  reply: string;
  clarification?: string;
};

/**
 * Interpreta o pedido do utilizador via proxy Railway (GPT).
 * Devolve null se o servidor não estiver configurado ou falhar (fallback local).
 */
export async function interpretCommandWithOpenAi(
  spokenText: string,
  now = new Date()
): Promise<AiInterpretedCommand | null> {
  const baseUrl = await getOpenAiProxyBaseUrl();
  if (!baseUrl) return null;

  const contacts = await listContacts();
  const contactNames = contacts
    .slice(0, 80)
    .map((c) => c.name)
    .filter(Boolean);
  const language = await getSecretinaLanguage();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/secretina/interpret`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await openAiProxyAuthHeaders()),
      },
      body: JSON.stringify({
        text: spokenText,
        contacts: contactNames,
        nowIso: now.toISOString(),
        nowLabel: formatDateTime(now.getTime()),
        language,
      }),
    });
  } catch (e) {
    console.warn('OpenAI interpret proxy network', e);
    return null;
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.warn('OpenAI interpret proxy', response.status, errText.slice(0, 200));
    return null;
  }

  try {
    const parsed = (await response.json()) as AiInterpretedCommand;
    if (!parsed || !Array.isArray(parsed.actions)) return null;
    return {
      actions: parsed.actions.filter(
        (a): a is AiAction =>
          !!a && typeof a === 'object' && ACTION_TYPES.has((a as AiAction).type)
      ),
      reply: typeof parsed.reply === 'string' ? parsed.reply : '',
      clarification:
        typeof parsed.clarification === 'string'
          ? parsed.clarification
          : undefined,
    };
  } catch (e) {
    console.warn('OpenAI interpret JSON', e);
    return null;
  }
}
