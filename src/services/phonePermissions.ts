import { PermissionsAndroid, Platform } from 'react-native';

const PHONE_STATE_MESSAGE = {
  title: 'Estado da chamada',
  message:
    'O SeCretina detecta quando você atende ou faz uma ligação para abrir a nota do contato.',
  buttonPositive: 'Permitir',
  buttonNegative: 'Negar',
};

const CALL_LOG_MESSAGE = {
  title: 'Registro de chamadas',
  message:
    'No Android 9+, o número do chamador ajuda a associar a ligação ao contato certo.',
  buttonPositive: 'Permitir',
  buttonNegative: 'Negar',
};

export async function hasPhoneStatePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE
  );
}

export async function hasCallLogPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const version =
    typeof Platform.Version === 'number' ? Platform.Version : 0;
  if (version < 28) return true;
  return PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.READ_CALL_LOG
  );
}

async function requestCallLogIfNeeded(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const version =
    typeof Platform.Version === 'number' ? Platform.Version : 0;
  if (version < 28) return true;

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
    CALL_LOG_MESSAGE
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export async function requestPhoneStatePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  const phone = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
    PHONE_STATE_MESSAGE
  );
  if (phone !== PermissionsAndroid.RESULTS.GRANTED) {
    return false;
  }

  await requestCallLogIfNeeded();
  return true;
}
