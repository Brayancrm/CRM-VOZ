import { Platform } from 'react-native';

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

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (!isNative) return false;
  const Notifications = getNotifications()!;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function ensureAndroidChannel(): Promise<void> {
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
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: new Date(at),
    channelId: 'lembretes-ligacao',
  };
}

/** Lembretes 1h e 5min — só Android/iOS (não disponível na web). */
export async function scheduleCallReminders(
  scheduledCallId: string,
  contactName: string,
  scheduledAt: number
): Promise<void> {
  if (!isNative) return;

  const Notifications = getNotifications()!;
  await ensureAndroidChannel();
  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  const oneHourBefore = scheduledAt - 60 * 60 * 1000;
  const fiveMinBefore = scheduledAt - 5 * 60 * 1000;
  const now = Date.now();

  if (oneHourBefore > now) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${scheduledCallId}-1h`,
      content: {
        title: 'Ligação em 1 hora',
        body: `Ligar para ${contactName}`,
        data: { scheduledCallId, contactName },
      },
      trigger: dateTrigger(oneHourBefore),
    });
  }

  if (fiveMinBefore > now) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${scheduledCallId}-5m`,
      content: {
        title: 'Ligação em 5 minutos',
        body: `Ligar para ${contactName}`,
        data: { scheduledCallId, contactName },
      },
      trigger: dateTrigger(fiveMinBefore),
    });
  }

  await Notifications.scheduleNotificationAsync({
    identifier: `${scheduledCallId}-at`,
    content: {
      title: 'Hora da ligação',
      body: `Ligar para ${contactName} agora`,
      data: { scheduledCallId, contactName },
    },
    trigger: dateTrigger(scheduledAt),
  });
}

export async function cancelCallReminders(
  scheduledCallId: string
): Promise<void> {
  if (!isNative) return;
  const Notifications = getNotifications()!;
  await Notifications.cancelScheduledNotificationAsync(`${scheduledCallId}-1h`);
  await Notifications.cancelScheduledNotificationAsync(`${scheduledCallId}-5m`);
  await Notifications.cancelScheduledNotificationAsync(`${scheduledCallId}-at`);
}
