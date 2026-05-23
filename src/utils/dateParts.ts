const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function buildDateFromParts(
  day: number,
  month: number,
  year: number,
  hour: number,
  minute: number
): Date {
  const maxDay = daysInMonth(year, month);
  const safeDay = Math.min(Math.max(1, day), maxDay);
  return new Date(year, month - 1, safeDay, hour, minute, 0, 0);
}

export function getYearOptions(): number[] {
  const y = new Date().getFullYear();
  return [y, y + 1, y + 2];
}

export function getMonthOptions(): { label: string; value: number }[] {
  return MONTH_NAMES.map((label, i) => ({ label, value: i + 1 }));
}

export function getDayOptions(year: number, month: number): number[] {
  const n = daysInMonth(year, month);
  return Array.from({ length: n }, (_, i) => i + 1);
}

export function getHourOptions(): number[] {
  return Array.from({ length: 24 }, (_, i) => i);
}

export function getMinuteOptions(): number[] {
  return Array.from({ length: 60 }, (_, i) => i);
}
