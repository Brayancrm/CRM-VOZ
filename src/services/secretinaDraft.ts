import type { AiAction } from '@/services/openaiInterpret';
import type { SecretinaLanguage } from '@/services/secretinaLanguage';

/** Campo em falta num pedido já interpretado (não repetir tudo). */
export type MissingSlot = 'when' | 'note_body' | 'new_when';

export type PendingCommandDraft = {
  originalText: string;
  actions: AiAction[];
  missing: MissingSlot;
  question: string;
  reply?: string;
};

export function findMissingSlot(actions: AiAction[]): MissingSlot | null {
  for (const a of actions) {
    if (a.type === 'note' && !a.noteBody?.trim()) return 'note_body';
    if (a.type === 'schedule') {
      const hasWhen = !!(a.whenIso?.trim() || a.whenRaw?.trim());
      if (!hasWhen) return 'when';
    }
    if (a.type === 'reschedule') {
      const hasWhen = !!(a.whenIso?.trim() || a.whenRaw?.trim());
      if (!hasWhen) return 'new_when';
    }
  }
  return null;
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
