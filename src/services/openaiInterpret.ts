import { listContacts } from '@/db/repositories/contacts';
import {
  getOpenAiProxyBaseUrl,
  openAiProxyAuthHeaders,
} from '@/services/openaiProxy';
import { formatDateTime } from '@/utils/date';

export type AiActionNote = {
  type: 'note';
  contactQuery: string;
  noteBody: string;
};

export type AiActionSchedule = {
  type: 'schedule';
  contactQuery: string;
  /** ISO 8601 preferencial */
  whenIso?: string;
  /** Frase em português se ISO falhar */
  whenRaw?: string;
  note?: string;
};

export type AiInterpretedCommand = {
  actions: Array<AiActionNote | AiActionSchedule>;
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
        (a) => a && (a.type === 'note' || a.type === 'schedule')
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
