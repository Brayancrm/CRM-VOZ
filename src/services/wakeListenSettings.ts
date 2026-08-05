import { getAppSetting, setAppSetting } from '@/db/repositories/appSettings';

const KEY_WAKE = 'secretina_wake_listen_enabled';

/** Escuta «Olá SeCretina» com o app em primeiro plano. */
export async function getWakeListenEnabled(): Promise<boolean> {
  const v = await getAppSetting(KEY_WAKE);
  return v === '1';
}

export async function setWakeListenEnabled(enabled: boolean): Promise<void> {
  await setAppSetting(KEY_WAKE, enabled ? '1' : '0');
}
