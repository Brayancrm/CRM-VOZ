import { Linking, Platform, PermissionsAndroid } from 'react-native';
import * as Contacts from 'expo-contacts';
import * as Calendar from 'expo-calendar';
import { requestMicrophonePermission } from '@/services/recording';
import { ensureNotificationPermissions } from '@/services/notifications';
import { requestPhoneStatePermission } from '@/services/phonePermissions';
import { isBatteryOptimizationDisabled } from '@/services/deviceSetup';

export type PermissionCheck = {
  mic: boolean;
  notifications: boolean;
  phone: boolean;
  callLog: boolean;
  contacts: boolean;
  calendar: boolean;
  batteryUnrestricted: boolean;
};

export type PermissionKind =
  | 'mic'
  | 'notifications'
  | 'phone'
  | 'contacts'
  | 'calendar';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function hasMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
}

export async function checkAllPermissions(): Promise<PermissionCheck> {
  if (Platform.OS !== 'android') {
    return {
      mic: false,
      notifications: false,
      phone: false,
      callLog: false,
      contacts: false,
      calendar: false,
      batteryUnrestricted: false,
    };
  }

  const mic = await hasMicrophonePermission();
  const phone = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE
  );
  const callLog =
    Platform.Version >= 28
      ? await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_CALL_LOG
        )
      : true;

  let contactsGranted = false;
  try {
    const { status } = await Contacts.getPermissionsAsync();
    contactsGranted = status === 'granted';
  } catch {
    contactsGranted = false;
  }

  let calGranted = false;
  try {
    const cal = await Calendar.getCalendarPermissionsAsync();
    calGranted = cal.status === 'granted';
  } catch {
    calGranted = false;
  }

  let notifGranted = false;
  try {
    const Notifications =
      require('expo-notifications') as typeof import('expo-notifications');
    const { status } = await Notifications.getPermissionsAsync();
    notifGranted = status === 'granted';
  } catch {
    notifGranted = false;
  }

  return {
    mic,
    notifications: notifGranted,
    phone,
    callLog,
    contacts: contactsGranted,
    calendar: calGranted,
    batteryUnrestricted: await isBatteryOptimizationDisabled(),
  };
}

/** Permissões mínimas para detecção + gravação. */
export function permissionsCriticalGranted(check: PermissionCheck): boolean {
  return (
    check.mic &&
    check.phone &&
    check.notifications &&
    check.batteryUnrestricted
  );
}

export function permissionsAllGranted(check: PermissionCheck): boolean {
  return (
    permissionsCriticalGranted(check) &&
    check.callLog &&
    check.contacts &&
    check.calendar
  );
}

/** Uma permissão por vez — evita travar o Android com vários diálogos seguidos. */
export async function requestSinglePermission(
  kind: PermissionKind
): Promise<PermissionCheck> {
  if (Platform.OS !== 'android') {
    return checkAllPermissions();
  }

  try {
    switch (kind) {
      case 'mic':
        await requestMicrophonePermission();
        break;
      case 'notifications':
        await ensureNotificationPermissions();
        break;
      case 'phone':
        await requestPhoneStatePermission();
        break;
      case 'contacts':
        await Contacts.requestPermissionsAsync();
        break;
      case 'calendar':
        await Calendar.requestCalendarPermissionsAsync();
        break;
    }
  } catch (e) {
    console.warn('KooMind: permissão', kind, e);
  }

  await sleep(350);
  return checkAllPermissions();
}

/** Sequência com pausa — mais estável que disparar tudo de uma vez. */
export async function requestAllAppPermissions(): Promise<PermissionCheck> {
  const order: PermissionKind[] = [
    'mic',
    'notifications',
    'phone',
    'contacts',
    'calendar',
  ];
  let last = await checkAllPermissions();
  for (const kind of order) {
    last = await requestSinglePermission(kind);
    await sleep(450);
  }
  return last;
}

export function openAppSettings(): void {
  void Linking.openSettings();
}
