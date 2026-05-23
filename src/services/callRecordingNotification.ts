import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const RECORDING_NOTIFICATION_ID = 'crm-voz-recording';

export async function showRecordingNotification(
  contactName: string
): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('gravacao-chamada', {
    name: 'Gravação em chamada',
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
  });

  await Notifications.scheduleNotificationAsync({
    identifier: RECORDING_NOTIFICATION_ID,
    content: {
      title: 'CRM-VOZ — gravando sua voz',
      body: `Somente suas notas (${contactName}). Não grava o interlocutor.`,
      sticky: true,
      priority: Notifications.AndroidNotificationPriority.LOW,
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
