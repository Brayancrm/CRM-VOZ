import { getAppSetting, setAppSetting } from '@/db/repositories/appSettings';

const KEY_MINUTES = 'crm_voz_reminder_minutes_before';
const KEY_AT_TIME = 'crm_voz_reminder_at_event_time';

const DEFAULT_MINUTES = [60, 5];

function parseMinutesJson(raw: string | null): number[] {
  if (!raw) return [...DEFAULT_MINUTES];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_MINUTES];
    const nums = parsed
      .map((v) => Math.floor(Number(v)))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 10_080);
    const unique = [...new Set(nums)].sort((a, b) => b - a);
    return unique.length > 0 ? unique : [...DEFAULT_MINUTES];
  } catch {
    return [...DEFAULT_MINUTES];
  }
}

export function formatMinutesBeforeLabel(minutes: number): string {
  if (minutes < 60) {
    return minutes === 1 ? '1 minuto antes' : `${minutes} minutos antes`;
  }
  if (minutes % 60 === 0 && minutes < 1440) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hora antes' : `${hours} horas antes`;
  }
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? '1 dia antes' : `${days} dias antes`;
  }
  return `${minutes} minutos antes`;
}

export function formatReminderNotificationTitle(minutes: number): string {
  if (minutes < 60) {
    return minutes === 1
      ? 'Ligação em 1 minuto'
      : `Ligação em ${minutes} minutos`;
  }
  if (minutes % 60 === 0 && minutes < 1440) {
    const hours = minutes / 60;
    return hours === 1 ? 'Ligação em 1 hora' : `Ligação em ${hours} horas`;
  }
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? 'Ligação em 1 dia' : `Ligação em ${days} dias`;
  }
  return `Ligação em ${minutes} minutos`;
}

export function formatCalendarReminderNotificationTitle(
  minutes: number
): string {
  if (minutes < 60) {
    return minutes === 1
      ? 'Compromisso em 1 minuto'
      : `Compromisso em ${minutes} minutos`;
  }
  if (minutes % 60 === 0 && minutes < 1440) {
    const hours = minutes / 60;
    return hours === 1
      ? 'Compromisso em 1 hora'
      : `Compromisso em ${hours} horas`;
  }
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1
      ? 'Compromisso em 1 dia'
      : `Compromisso em ${days} dias`;
  }
  return `Compromisso em ${minutes} minutos`;
}

export async function getReminderMinutesBefore(): Promise<number[]> {
  const raw = await getAppSetting(KEY_MINUTES);
  return parseMinutesJson(raw);
}

export async function setReminderMinutesBefore(
  minutes: number[]
): Promise<void> {
  const cleaned = [...new Set(minutes.map((m) => Math.floor(m)))]
    .filter((n) => n > 0 && n <= 10_080)
    .sort((a, b) => b - a);
  if (cleaned.length === 0) {
    throw new Error('Informe pelo menos um lembrete em minutos.');
  }
  await setAppSetting(KEY_MINUTES, JSON.stringify(cleaned));
}

export async function getRemindAtEventTime(): Promise<boolean> {
  const raw = await getAppSetting(KEY_AT_TIME);
  if (raw === null) return true;
  return raw === '1' || raw === 'true';
}

export async function setRemindAtEventTime(enabled: boolean): Promise<void> {
  await setAppSetting(KEY_AT_TIME, enabled ? '1' : '0');
}

export function normalizeNewReminderMinutes(input: string): number | null {
  const n = Math.floor(Number(input.trim()));
  if (!Number.isFinite(n) || n <= 0 || n > 10_080) return null;
  return n;
}

/** Identificadores usados ao agendar/cancelar notificações. */
export async function reminderNotificationIds(
  scheduledCallId: string
): Promise<string[]> {
  const minutes = await getReminderMinutesBefore();
  const ids = minutes.map((m) => `${scheduledCallId}-before-${m}`);
  if (await getRemindAtEventTime()) {
    ids.push(`${scheduledCallId}-at`);
  }
  ids.push(`${scheduledCallId}-1h`, `${scheduledCallId}-5m`);
  return ids;
}
