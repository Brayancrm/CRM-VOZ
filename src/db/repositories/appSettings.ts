import { Platform } from 'react-native';

export async function getAppSetting(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    const m = await import('@/db/repositories/appSettings.web');
    return m.getAppSetting(key);
  }
  const m = await import('@/db/repositories/appSettings.native');
  return m.getAppSetting(key);
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    const m = await import('@/db/repositories/appSettings.web');
    return m.setAppSetting(key, value);
  }
  const m = await import('@/db/repositories/appSettings.native');
  return m.setAppSetting(key, value);
}
