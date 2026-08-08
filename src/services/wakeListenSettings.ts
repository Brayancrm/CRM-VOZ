import { getAppSetting, setAppSetting } from '@/db/repositories/appSettings';

const KEY_WAKE = 'secretina_wake_listen_enabled';

/** Escuta «Olá {nome}» com o app em primeiro plano. */
export async function getWakeListenEnabled(): Promise<boolean> {
  const v = await getAppSetting(KEY_WAKE);
  return v === '1';
}

/**
 * Activa o chamamento de forma permanente (só no carrossel).
 * Não há desactivação — pedidos com false são ignorados.
 */
export async function setWakeListenEnabled(enabled: boolean): Promise<void> {
  if (!enabled) return;
  await setAppSetting(KEY_WAKE, '1');
}

/** Alias explícito para o onboarding. */
export async function enableWakeListenPermanent(): Promise<void> {
  await setAppSetting(KEY_WAKE, '1');
}
