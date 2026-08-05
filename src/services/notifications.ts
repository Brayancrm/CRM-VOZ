import { Platform } from 'react-native';
import { listScheduledInRange } from '@/db/repositories/scheduledCalls';
import {
  formatReminderNotificationTitle,
  getReminderMinutesBefore,
  getRemindAtEventTime,
  reminderNotificationIds,
} from '@/services/reminderSettings';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

type NotificationsModule = typeof import('expo-notifications');

function getNotifications(): NotificationsModule | null {
  if (!isNative) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications') as NotificationsModule;
}

if (isNative) {
  const Notifications = getNotifications()!;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function hasNotificationPermission(): Promise<boolean> {
  if (!isNative) return false;
  const Notifications = getNotifications()!;
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/** Só pede permissão quando `requestIfNeeded` — evita crash com modal aberto. */
export async function ensureNotificationPermissions(
  requestIfNeeded = true
): Promise<boolean> {
  if (!isNative) return false;
  if (await hasNotificationPermission()) return true;
  if (!requestIfNeeded) return false;
  const Notifications = getNotifications()!;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const Notifications = getNotifications()!;
  await Notifications.setNotificationChannelAsync('lembretes-ligacao', {
    name: 'Lembretes de ligação',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
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

function reminderContent(
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

/** Lembretes configuráveis em Ajustes — só Android/iOS. */
export async function scheduleCallReminders(
  scheduledCallId: string,
  contactName: string,
  scheduledAt: number
): Promise<void> {
  if (!isNative) return;

  const Notifications = getNotifications()!;
  await ensureAndroidChannel();
  const granted = await hasNotificationPermission();
  if (!granted) return;

  const minutesBefore = await getReminderMinutesBefore();
  const remindAtTime = await getRemindAtEventTime();
  const now = Date.now();

  for (const minutes of minutesBefore) {
    const triggerAt = scheduledAt - minutes * 60 * 1000;
    if (triggerAt <= now) continue;

    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${scheduledCallId}-before-${minutes}`,
        content: reminderContent(
          formatReminderNotificationTitle(minutes),
          `Ligar para ${contactName}`,
          { scheduledCallId, contactName, minutesBefore: minutes }
        ),
        trigger: dateTrigger(triggerAt),
      });
    } catch (e) {
      console.warn('KooMind: lembrete não agendado', minutes, e);
    }
  }

  if (remindAtTime && scheduledAt > now) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${scheduledCallId}-at`,
        content: reminderContent(
          'Hora da ligação',
          `Ligar para ${contactName} agora`,
          { scheduledCallId, contactName }
        ),
        trigger: dateTrigger(scheduledAt),
      });
    } catch (e) {
      console.warn('KooMind: lembrete na hora não agendado', e);
    }
  }
}

export async function cancelCallReminders(
  scheduledCallId: string
): Promise<void> {
  if (!isNative) return;
  const Notifications = getNotifications()!;
  const ids = await reminderNotificationIds(scheduledCallId);
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      /* id pode não existir */
    }
  }
}

/** Reaplica lembretes a ligações APP pendentes e eventos do calendário do celular. */
export async function rescheduleAllPendingCallReminders(): Promise<{
  appCalls: number;
  calendarEvents: number;
}> {
  if (!isNative) return { appCalls: 0, calendarEvents: 0 };

  const now = Date.now();
  const pending = await listScheduledInRange(now, Number.MAX_SAFE_INTEGER);
  const open = pending.filter((p) => p.completed !== 1);

  for (const item of open) {
    await cancelCallReminders(item.id);
    await scheduleCallReminders(item.id, item.contact_name, item.scheduled_at);
  }

  const { syncDeviceCalendarReminders } = await import(
    '@/services/deviceCalendarReminders'
  );
  const calendarEvents = await syncDeviceCalendarReminders();

  return { appCalls: open.length, calendarEvents };
}
