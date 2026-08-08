import type { AiAction } from '@/services/openaiInterpret';
import type { SecretinaLanguage } from '@/services/secretinaLanguage';
import { parseSpokenDateTime } from '@/utils/spokenDateTime';
import { normalizeSpoken } from '@/utils/normalizeSpoken';

/** Campo em falta num pedido já interpretado (não repetir tudo). */
export type MissingSlot = 'when' | 'note_body' | 'new_when';

export type PendingCommandDraft = {
  originalText: string;
  actions: AiAction[];
  missing: MissingSlot;
  question: string;
  reply?: string;
};

function whenResolvable(whenIso?: string, whenRaw?: string): boolean {
  if (whenIso?.trim()) {
    const t = Date.parse(whenIso);
    if (!Number.isNaN(t)) return true;
  }
  if (whenRaw?.trim()) {
    return parseSpokenDateTime(whenRaw) != null;
  }
  return false;
}

export function findMissingSlot(actions: AiAction[]): MissingSlot | null {
  for (const a of actions) {
    if (a.type === 'note' && !a.noteBody?.trim()) return 'note_body';
    if (a.type === 'schedule') {
      // «amanhã» sem hora → falta horário (não repetir o pedido todo)
      if (!whenResolvable(a.whenIso, a.whenRaw)) return 'when';
    }
    if (a.type === 'reschedule') {
      if (!whenResolvable(a.whenIso, a.whenRaw)) return 'new_when';
    }
  }
  return null;
}

/**
 * Corrige IA que devolve list_agenda para «agenda com Maria amanhã».
 */
export function coerceCreateScheduleActions(
  spokenText: string,
  actions: AiAction[]
): AiAction[] {
  const norm = normalizeSpoken(spokenText);
  const isCreate =
    (/\b(agenda|agende|agendar|marca|marque|marcar)\b/.test(norm) &&
      /\bcom\b/.test(norm)) ||
    (/\b(agende|agendar|marca|marque|marcar)\b/.test(norm) &&
      /\b(ligacao|chamada|call)\b/.test(norm));
  if (!isCreate) return actions;

  const onlyList =
    actions.length > 0 && actions.every((a) => a.type === 'list_agenda');
  if (!onlyList) return actions;

  const list = actions[0];
  if (list.type !== 'list_agenda') return actions;
  const contactQuery = (list.contactQuery || '').trim();
  if (!contactQuery) return actions;

  return [
    {
      type: 'schedule',
      contactQuery,
      whenRaw: list.whenRaw || spokenText,
    },
  ];
}

/** Junta só o pedaço em falta ao rascunho (ex.: «às 15» + «amanhã com a Maria»). */
export function mergeSlotFill(
  actions: AiAction[],
  missing: MissingSlot,
  fillText: string
): AiAction[] {
  const text = fillText.trim();
  if (!text) return actions;

  return actions.map((a) => {
    if (missing === 'note_body' && a.type === 'note') {
      return { ...a, noteBody: text };
    }
    if (missing === 'when' && a.type === 'schedule') {
      const prev = (a.whenRaw ?? '').trim();
      return {
        ...a,
        whenIso: undefined,
        whenRaw: prev ? `${prev} ${text}` : text,
      };
    }
    if (missing === 'new_when' && a.type === 'reschedule') {
      const prev = (a.whenRaw ?? '').trim();
      return {
        ...a,
        whenIso: undefined,
        whenRaw: prev ? `${prev} ${text}` : text,
      };
    }
    return a;
  });
}

export function questionForMissingSlot(
  missing: MissingSlot,
  lang: SecretinaLanguage,
  clarification?: string
): string {
  const c = clarification?.trim();
  if (c) return c;
  if (missing === 'note_body') {
    if (lang === 'es') return '¿Qué texto quiere en la nota?';
    if (lang === 'en') return 'What should the note say?';
    return 'Qual o texto da nota?';
  }
  if (missing === 'new_when') {
    if (lang === 'es') return '¿Para qué fecha y hora quiere remarcar?';
    if (lang === 'en') return 'To what date and time should I move it?';
    return 'Para que data e hora quer remarcar?';
  }
  if (lang === 'es') return '¿A qué hora?';
  if (lang === 'en') return 'What time?';
  return 'A que horas?';
}

export function listeningHintForSlot(
  missing: MissingSlot,
  lang: SecretinaLanguage
): string {
  if (missing === 'note_body') {
    if (lang === 'es') return 'Diga el texto de la nota…';
    if (lang === 'en') return 'Say the note text…';
    return 'Diga o texto da nota…';
  }
  if (missing === 'new_when') {
    if (lang === 'es') return 'Diga la nueva fecha y hora…';
    if (lang === 'en') return 'Say the new date and time…';
    return 'Diga a nova data e hora…';
  }
  if (lang === 'es') return 'Diga la hora…';
  if (lang === 'en') return 'Say the time…';
  return 'Diga a hora…';
}
