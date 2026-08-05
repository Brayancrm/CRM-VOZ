import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const RECORDING_NOTIFICATION_ID = 'koomind-recording';

export async function showRecordingNotification(
  contactName: string,
  phoneDisplay?: string
): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('gravacao-chamada', {
    name: 'Gravação em chamada',
    importance: Notifications.AndroidImportance.HIGH,
    sound: null,
    vibrationPattern: [0, 250],
  });

  const phoneLine = phoneDisplay?.trim()
    ? `\n${phoneDisplay.trim()}`
    : '';

  await Notifications.scheduleNotificationAsync({
    identifier: RECORDING_NOTIFICATION_ID,
    content: {
      title: `Gravando — ${contactName}`,
      body: `KooMind está salvando só a sua voz (não grava o interlocutor).${phoneLine}`,
      sticky: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
      ...(Platform.OS === 'android'
        ? { channelId: 'gravacao-chamada' }
        : {}),
    },
    trigger: null,
  });
}

export async function dismissRecordingNotification(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.dismissNotificationAsync(RECORDING_NOTIFICATION_ID);
  } catch {
    await Notifications.cancelScheduledNotificationAsync(
      RECORDING_NOTIFICATION_ID
    );
  }
}
