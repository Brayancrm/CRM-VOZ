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

const WEEKDAYS: { re: RegExp; day: number; labelPt: string; labelEs: string; labelEn: string }[] = [
  { re: /\bdomingo\b|\bsunday\b/, day: 0, labelPt: 'domingo', labelEs: 'domingo', labelEn: 'Sunday' },
  { re: /\bsegunda(?:-feira)?\b|\bmonday\b|\blunes\b/, day: 1, labelPt: 'segunda', labelEs: 'lunes', labelEn: 'Monday' },
  { re: /\bterca(?:-feira)?\b|\btuesday\b|\bmartes\b/, day: 2, labelPt: 'terça', labelEs: 'martes', labelEn: 'Tuesday' },
  { re: /\bquarta(?:-feira)?\b|\bwednesday\b|\bmiercoles\b/, day: 3, labelPt: 'quarta', labelEs: 'miércoles', labelEn: 'Wednesday' },
  { re: /\bquinta(?:-feira)?\b|\bthursday\b|\bjueves\b/, day: 4, labelPt: 'quinta', labelEs: 'jueves', labelEn: 'Thursday' },
  { re: /\bsexta(?:-feira)?\b|\bfriday\b|\bviernes\b/, day: 5, labelPt: 'sexta', labelEs: 'viernes', labelEn: 'Friday' },
  { re: /\bsabado\b|\bsaturday\b/, day: 6, labelPt: 'sábado', labelEs: 'sábado', labelEn: 'Saturday' },
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
  d.setDate(d.getDate() + add);
  return d;
}

function detectLabelLang(n: string): 'pt' | 'es' | 'en' {
  if (/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this\s+week|upcoming|what\s+do\s+i\s+have)\b/.test(n)) {
    return 'en';
  }
  if (/\b(hoy|manana|lunes|martes|miercoles|jueves|viernes|esta\s+semana|que\s+tengo)\b/.test(n)) {
    return 'es';
  }
  return 'pt';
}

/**
 * Interpreta intervalos de agenda sem exigir hora
 * («hoje», «today», «esta semana», «segunda», «próximos»).
 */
export function parseSpokenDateRange(
  raw: string,
  now = new Date(),
  preferredLang?: 'pt-BR' | 'es' | 'en'
): SpokenDateRange | null {
  const n = normalizeSpoken(raw);
  if (!n) return null;
  const L =
    preferredLang === 'en'
      ? 'en'
      : preferredLang === 'es'
        ? 'es'
        : preferredLang === 'pt-BR'
          ? 'pt'
          : detectLabelLang(n);

  if (
    /\besta\s+semana\b|\bnessa\s+semana\b|\bna\s+semana\b|\bthis\s+week\b|\besta\s+semana\b/.test(
      n
    )
  ) {
    const w = getWeekWindow(now);
    return {
      ...w,
      label: L === 'en' ? 'this week' : L === 'es' ? 'esta semana' : 'esta semana',
    };
  }

  if (
    /\bproximos?\s+7\s+dias\b|\bproximos?\s+dias\b|\bproximos?\b|\bnext\s+7\s+days\b|\bupcoming\b|\bproximos?\s+dias\b/.test(
      n
    )
  ) {
    const w = getNext7DaysWindow(now);
    return {
      ...w,
      label:
        L === 'en'
          ? 'in the next 7 days'
          : L === 'es'
            ? 'en los próximos 7 días'
            : 'nos próximos 7 dias',
    };
  }

  if (/\bdepois\s+de\s+amanha\b|\bday\s+after\s+tomorrow\b|\bpasado\s+manana\b/.test(n)) {
    return dayWindowForOffset(
      2,
      L === 'en'
        ? 'the day after tomorrow'
        : L === 'es'
          ? 'pasado mañana'
          : 'depois de amanhã'
    );
  }
  if (/\bamanha\b|\btomorrow\b|\bmanana\b/.test(n)) {
    return dayWindowForOffset(
      1,
      L === 'en' ? 'tomorrow' : L === 'es' ? 'mañana' : 'amanhã'
    );
  }
  if (/\bhoje\b|\btoday\b|\bhoy\b/.test(n)) {
    const w = getDayWindow(now);
    return {
      ...w,
      label: L === 'en' ? 'today' : L === 'es' ? 'hoy' : 'hoje',
    };
  }

  for (const w of WEEKDAYS) {
    if (w.re.test(n)) {
      const day = nextWeekdayDay(w.day);
      const win = getDayWindow(day);
      const label =
        L === 'en' ? w.labelEn : L === 'es' ? w.labelEs : w.labelPt;
      return { ...win, label };
    }
  }

  if (
    /\b(agenda|agendamentos?|compromissos?|ligacoes?|chamadas?|appointments?|schedule|citas?)\b/.test(
      n
    ) ||
    /\b(o\s+que\s+tenho|quais|mostra|mostrar|lista|listar|pesquisa|pesquisar|busca|buscar|what\s+do\s+i\s+have|show|list|search|que\s+tengo|mostrar|buscar)\b/.test(
      n
    )
  ) {
    const w = getUpcomingWindow(now);
    return {
      ...w,
      label: L === 'en' ? 'on the agenda' : L === 'es' ? 'en la agenda' : 'na agenda',
    };
  }

  return null;
}
