import { Platform } from 'react-native';
import { listDeviceCalendarEvents } from '@/services/deviceCalendar';
import {
  formatCalendarReminderNotificationTitle,
  getReminderMinutesBefore,
  getRemindAtEventTime,
} from '@/services/reminderSettings';
import {
  ensureAndroidChannel,
  hasNotificationPermission,
} from '@/services/notifications';
import { getUpcomingWindow } from '@/utils/date';
import type { DeviceCalendarEvent } from '@/types';

const DEVCAL_PREFIX = 'devcal-';
const MAX_EVENTS = 25;

type NotificationsModule = typeof import('expo-notifications');

function getNotifications(): NotificationsModule | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications') as NotificationsModule;
}

function dateTrigger(at: number): import('expo-notifications').NotificationTriggerInput {
  const Notifications = getNotifications()!;
  const date = new Date(at);
  if (Platform.OS === 'android') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: 'lembretes-ligacao',
    };
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date,
  };
}

function calendarReminderContent(
  title: string,
  body: string,
  data: Record<string, unknown>
): import('expo-notifications').NotificationContentInput {
  return {
    title,
    body,
    data,
    ...(Platform.OS === 'android'
      ? { channelId: 'lembretes-ligacao' }
      : {}),
  };
}

async function cancelAllDeviceCalendarNotifications(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const item of scheduled) {
    if (item.identifier.startsWith(DEVCAL_PREFIX)) {
      try {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      } catch {
        /* ignorar */
      }
    }
  }
}

function pickUpcomingEvents(events: DeviceCalendarEvent[]): DeviceCalendarEvent[] {
  const now = Date.now();
  return events
    .filter((e) => e.endAt > now)
    .sort((a, b) => a.startAt - b.startAt)
    .slice(0, MAX_EVENTS);
}

async function scheduleEventReminders(
  event: DeviceCalendarEvent,
  minutesBefore: number[],
  remindAtTime: boolean
): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;

  const now = Date.now();
  const title = event.title || 'Compromisso';

  for (const minutes of minutesBefore) {
    const triggerAt = event.startAt - minutes * 60 * 1000;
    if (triggerAt <= now) continue;

    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${DEVCAL_PREFIX}${event.id}-before-${minutes}`,
        content: calendarReminderContent(
          formatCalendarReminderNotificationTitle(minutes),
          title,
          {
            type: 'device_calendar',
            eventId: event.id,
            minutesBefore: minutes,
          }
        ),
        trigger: dateTrigger(triggerAt),
      });
    } catch (e) {
      console.warn('KooMind: lembrete calendário não agendado', e);
    }
  }

  if (remindAtTime && event.startAt > now) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${DEVCAL_PREFIX}${event.id}-at`,
        content: calendarReminderContent(
          'Hora do compromisso',
          title,
          { type: 'device_calendar', eventId: event.id }
        ),
        trigger: dateTrigger(event.startAt),
      });
    } catch (e) {
      console.warn('KooMind: lembrete calendário na hora não agendado', e);
    }
  }
}

/** Sincroniza lembretes para eventos do calendário nativo (mesmas regras de Ajustes). */
export async function syncDeviceCalendarReminders(): Promise<number> {
  if (Platform.OS === 'web') return 0;

  try {
    const Notifications = getNotifications();
    if (!Notifications) return 0;

    await ensureAndroidChannel();
    if (!(await hasNotificationPermission())) return 0;

    await cancelAllDeviceCalendarNotifications();

    const { start, end } = getUpcomingWindow();
    const { events, access } = await listDeviceCalendarEvents(start, end);
    if (access !== 'granted' || events.length === 0) return 0;

    const minutesBefore = await getReminderMinutesBefore();
    const remindAtTime = await getRemindAtEventTime();
    const picked = pickUpcomingEvents(events);

    for (const event of picked) {
      await scheduleEventReminders(event, minutesBefore, remindAtTime);
    }

    return picked.length;
  } catch (e) {
    console.warn('KooMind: sync lembretes calendário', e);
    return 0;
  }
}
