export function formatDateTime(
  ts: number,
  lang: 'pt-BR' | 'es' | 'en' = 'pt-BR'
): string {
  const locale = lang === 'es' ? 'es-ES' : lang === 'en' ? 'en-US' : 'pt-BR';
  return new Date(ts).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Sábado 00:00 da semana corrente até sexta 23:59:59 seguinte. */
export function getNext7DaysWindow(now = new Date()): { start: number; end: number } {
  const day = now.getDay();
  const daysSinceSaturday = (day + 1) % 7;
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - daysSinceSaturday);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);
  return { start: startDate.getTime(), end: endDate.getTime() };
}

export function getWeekWindow(now = new Date()): { start: number; end: number } {
  const start = new Date(now);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

export function getMonthWindow(now = new Date()): { start: number; end: number } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

/** Hoje 00:00 até +2 anos — padrão da agenda («Próximos»). */
export function getUpcomingWindow(now = new Date()): { start: number; end: number } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setFullYear(end.getFullYear() + 2);
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

export function getDayWindow(day = new Date()): { start: number; end: number } {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

export function formatEventTime(
  startAt: number,
  endAt: number,
  allDay: boolean
): string {
  if (allDay) {
    const start = formatDate(startAt);
    const end = formatDate(endAt);
    return start === end ? `${start} · dia inteiro` : `${start} – ${end} · dia inteiro`;
  }
  const start = formatDateTime(startAt);
  if (endAt - startAt <= 60_000) return start;
  const end = new Date(endAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${start} – ${end}`;
}

export function describeFilterRange(
  filter: 'upcoming' | 'day' | 'week' | 'month' | 'next7',
  day?: Date
): string {
  if (filter === 'day' && day) {
    return formatDate(day.getTime());
  }
  const map = {
    upcoming: getUpcomingWindow,
    week: getWeekWindow,
    month: getMonthWindow,
    next7: getNext7DaysWindow,
    day: () => getDayWindow(day ?? new Date()),
  } as const;
  const { start, end } = map[filter]();
  return filter === 'day' ? formatDate(start) : `${formatDate(start)} até ${formatDate(end)}`;
}
