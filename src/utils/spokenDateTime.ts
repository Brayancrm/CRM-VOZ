import { normalizeSpoken } from '@/utils/normalizeSpoken';

const WEEKDAYS: { re: RegExp; day: number }[] = [
  { re: /\bdomingo\b|\bsunday\b/, day: 0 },
  { re: /\bsegunda(?:-feira)?\b|\bmonday\b|\blunes\b/, day: 1 },
  { re: /\bterca(?:-feira)?\b|\btuesday\b|\bmartes\b/, day: 2 },
  { re: /\bquarta(?:-feira)?\b|\bwednesday\b|\bmiercoles\b/, day: 3 },
  { re: /\bquinta(?:-feira)?\b|\bthursday\b|\bjueves\b/, day: 4 },
  { re: /\bsexta(?:-feira)?\b|\bfriday\b|\bviernes\b/, day: 5 },
  { re: /\bsabado\b|\bsaturday\b/, day: 6 },
];

const MONTHS: { re: RegExp; month: number }[] = [
  { re: /\bjaneiro\b/, month: 1 },
  { re: /\bfevereiro\b/, month: 2 },
  { re: /\bmarco\b/, month: 3 },
  { re: /\babril\b/, month: 4 },
  { re: /\bmaio\b/, month: 5 },
  { re: /\bjunho\b/, month: 6 },
  { re: /\bjulho\b/, month: 7 },
  { re: /\bagosto\b/, month: 8 },
  { re: /\bsetembro\b/, month: 9 },
  { re: /\boutubro\b/, month: 10 },
  { re: /\bnovembro\b/, month: 11 },
  { re: /\bdezembro\b/, month: 12 },
];

function nextWeekday(from: Date, targetDow: number): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  let add = (targetDow - d.getDay() + 7) % 7;
  if (add === 0) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

function parseHourMinute(text: string): { hour: number; minute: number } | null {
  const n = normalizeSpoken(text);

  let m = n.match(/\b(\d{1,2})\s*[:h]\s*(\d{1,2})\b/);
  if (m) {
    return { hour: Number(m[1]), minute: Number(m[2]) };
  }

  m = n.match(
    /\b(?:as|a|at|a\s+las?)\s+(\d{1,2})(?:\s*(?:horas?|hrs?|h|o'?clock))?(?:\s+e\s+(\d{1,2}))?\b/
  );
  if (m) {
    return { hour: Number(m[1]), minute: m[2] ? Number(m[2]) : 0 };
  }

  m = n.match(/\b(\d{1,2})\s*(?:horas?|hrs?)\b/);
  if (m) {
    return { hour: Number(m[1]), minute: 0 };
  }

  m = n.match(/\b(\d{1,2})\s*(?:am|pm)\b/);
  if (m) {
    let hour = Number(m[1]);
    if (n.includes('pm') && hour < 12) hour += 12;
    if (n.includes('am') && hour === 12) hour = 0;
    return { hour, minute: 0 };
  }

  m = n.match(/\b(\d{1,2})\s+da\s+(manha|tarde|noite)\b/);
  if (m) {
    let hour = Number(m[1]);
    const period = m[2];
    if ((period.includes('tarde') || period.includes('noite')) && hour < 12) {
      hour += 12;
    }
    if (period.includes('manha') && hour === 12) {
      hour = 0;
    }
    return { hour, minute: 0 };
  }

  m = n.match(/\b(?:as|a|at|a\s+las?)\s+(\d{1,2})\b/);
  if (m) {
    return { hour: Number(m[1]), minute: 0 };
  }

  return null;
}

function monthFromName(name: string): number | null {
  for (const mo of MONTHS) {
    if (mo.re.test(name)) return mo.month;
  }
  return null;
}

/**
 * Interpreta data/hora falada em pt-BR, incluindo anos distantes.
 * Ex.: "amanha as 15", "15 de marco de 2029 as 10", "daqui a 2 anos as 9"
 */
export function parseSpokenDateTime(
  raw: string,
  now = new Date()
): Date | null {
  const n = normalizeSpoken(raw);
  if (!n) return null;

  const time = parseHourMinute(n);
  if (!time) return null;
  let { hour, minute } = time;
  if (hour > 23 || minute > 59) return null;

  if (/\bda\s+tarde\b|\bda\s+noite\b/.test(n) && hour > 0 && hour < 12) {
    hour += 12;
  }
  if (/\bda\s+manha\b/.test(n) && hour === 12) {
    hour = 0;
  }

  const result = new Date(now);
  result.setSeconds(0, 0);

  const yearsAhead = n.match(/\bdaqui\s+a\s+(\d{1,2})\s+anos?\b/);
  if (yearsAhead) {
    const add = Number(yearsAhead[1]);
    if (add >= 1 && add <= 10) {
      result.setFullYear(result.getFullYear() + add);
      result.setHours(hour, minute, 0, 0);
      return result;
    }
  }

  // "15 de marco de 2029" / "dia 15 de marco de 2029" / "15/03/2029"
  const fullDate = n.match(
    /\b(?:dia\s+)?(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(20\d{2}))?\b/
  );
  const slashDate = n.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/);

  if (slashDate) {
    const day = Number(slashDate[1]);
    const month = Number(slashDate[2]);
    const year = Number(slashDate[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      result.setFullYear(year, month - 1, day);
      result.setHours(hour, minute, 0, 0);
      return result.getTime() > now.getTime() + 60_000 ? result : null;
    }
  }

  if (fullDate) {
    const day = Number(fullDate[1]);
    const month = monthFromName(fullDate[2]);
    let year = fullDate[3] ? Number(fullDate[3]) : result.getFullYear();
    if (month != null) {
      result.setFullYear(year, month - 1, day);
      if (!fullDate[3] && result.getTime() <= now.getTime()) {
        result.setFullYear(year + 1);
      }
      result.setHours(hour, minute, 0, 0);
      if (result.getTime() <= now.getTime() + 60_000) return null;
      return result;
    }
  }

  // Ano explícito sem dia completo: "em 2029 as 10" → 1 jan 2029 (fraco) — exige dia/mês
  // Só aplica se também houver mês
  const yearOnlyWithMonth = n.match(
    /\b([a-z]+)\s+(?:de\s+)?(20\d{2})\b/
  );
  if (yearOnlyWithMonth && !fullDate) {
    const month = monthFromName(yearOnlyWithMonth[1]);
    const year = Number(yearOnlyWithMonth[2]);
    if (month != null) {
      result.setFullYear(year, month - 1, 1);
      result.setHours(hour, minute, 0, 0);
      if (result.getTime() > now.getTime() + 60_000) return result;
    }
  }

  if (/\bhoje\b|\btoday\b|\bhoy\b/.test(n)) {
    // keep date
  } else if (/\bdepois\s+de\s+amanha\b|\bday\s+after\s+tomorrow\b|\bpasado\s+manana\b/.test(n)) {
    result.setDate(result.getDate() + 2);
  } else if (/\bamanha\b|\btomorrow\b|\bmanana\b/.test(n)) {
    result.setDate(result.getDate() + 1);
  } else {
    let matchedWeekday = false;
    for (const w of WEEKDAYS) {
      if (w.re.test(n)) {
        const candidate = nextWeekday(now, w.day);
        if (now.getDay() === w.day) {
          const todayAt = new Date(now);
          todayAt.setHours(hour, minute, 0, 0);
          if (todayAt.getTime() > now.getTime() + 60_000) {
            result.setTime(todayAt.getTime());
            matchedWeekday = true;
            break;
          }
        }
        result.setFullYear(
          candidate.getFullYear(),
          candidate.getMonth(),
          candidate.getDate()
        );
        matchedWeekday = true;
        break;
      }
    }

    if (!matchedWeekday) {
      const dayMonth = n.match(/\bdia\s+(\d{1,2})(?:\s+de\s+([a-z]+))?\b/);
      if (dayMonth) {
        const day = Number(dayMonth[1]);
        let month = result.getMonth() + 1;
        let year = result.getFullYear();
        if (dayMonth[2]) {
          const m = monthFromName(dayMonth[2]);
          if (m != null) month = m;
        }
        const yearMatch = n.match(/\b(20\d{2})\b/);
        if (yearMatch) year = Number(yearMatch[1]);
        result.setFullYear(year, month - 1, day);
        if (!yearMatch && result.getTime() <= now.getTime()) {
          result.setFullYear(year + 1);
        }
      }
    }
  }

  result.setHours(hour, minute, 0, 0);
  if (result.getTime() <= now.getTime() + 60_000) {
    if (/\bhoje\b|\btoday\b|\bhoy\b/.test(n)) return null;
    result.setDate(result.getDate() + 1);
  }

  return result;
}
