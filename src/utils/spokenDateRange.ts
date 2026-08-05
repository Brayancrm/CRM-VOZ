import { normalizeSpoken } from '@/utils/normalizeSpoken';
import {
  getDayWindow,
  getNext7DaysWindow,
  getUpcomingWindow,
  getWeekWindow,
} from '@/utils/date';

export type SpokenDateRange = {
  start: number;
  end: number;
  label: string;
};

const WEEKDAYS: { re: RegExp; day: number; label: string }[] = [
  { re: /\bdomingo\b/, day: 0, label: 'domingo' },
  { re: /\bsegunda(?:-feira)?\b/, day: 1, label: 'segunda' },
  { re: /\bterca(?:-feira)?\b/, day: 2, label: 'terça' },
  { re: /\bquarta(?:-feira)?\b/, day: 3, label: 'quarta' },
  { re: /\bquinta(?:-feira)?\b/, day: 4, label: 'quinta' },
  { re: /\bsexta(?:-feira)?\b/, day: 5, label: 'sexta' },
  { re: /\bsabado\b/, day: 6, label: 'sábado' },
];

function dayWindowForOffset(days: number, label: string): SpokenDateRange {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const { start, end } = getDayWindow(d);
  return { start, end, label };
}

function nextWeekdayDay(targetDow: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  let add = (targetDow - d.getDay() + 7) % 7;
  // «na segunda» com hoje=segunda → hoje; senão próximo
  d.setDate(d.getDate() + add);
  return d;
}

/**
 * Interpreta intervalos de agenda sem exigir hora
 * («hoje», «esta semana», «segunda», «próximos»).
 */
export function parseSpokenDateRange(
  raw: string,
  now = new Date()
): SpokenDateRange | null {
  const n = normalizeSpoken(raw);
  if (!n) return null;

  if (/\besta\s+semana\b|\bnessa\s+semana\b|\bna\s+semana\b/.test(n)) {
    const w = getWeekWindow(now);
    return { ...w, label: 'esta semana' };
  }

  if (/\bproximos?\s+7\s+dias\b|\bproximos?\s+dias\b|\bproximos?\b/.test(n)) {
    const w = getNext7DaysWindow(now);
    return { ...w, label: 'nos próximos 7 dias' };
  }

  if (/\bdepois\s+de\s+amanha\b/.test(n)) {
    return dayWindowForOffset(2, 'depois de amanhã');
  }
  if (/\bamanha\b/.test(n)) {
    return dayWindowForOffset(1, 'amanhã');
  }
  if (/\bhoje\b/.test(n)) {
    const w = getDayWindow(now);
    return { ...w, label: 'hoje' };
  }

  for (const w of WEEKDAYS) {
    if (w.re.test(n)) {
      const day = nextWeekdayDay(w.day);
      const win = getDayWindow(day);
      return { ...win, label: w.label };
    }
  }

  // Sem marcador temporal explícito → próximos pendentes
  if (
    /\b(agenda|agendamentos?|compromissos?|ligacoes?|chamadas?)\b/.test(n) ||
    /\b(o\s+que\s+tenho|quais|mostra|mostrar|lista|listar|pesquisa|pesquisar|busca|buscar)\b/.test(
      n
    )
  ) {
    const w = getUpcomingWindow(now);
    return { ...w, label: 'na agenda' };
  }

  return null;
}
