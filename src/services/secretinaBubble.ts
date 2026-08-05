import { NativeModules, Platform } from 'react-native';

type BubbleNative = {
  canDrawOverlays?: () => Promise<boolean>;
  openOverlayPermissionSettings?: () => Promise<boolean>;
  startSecretinaBubble?: () => Promise<boolean>;
  stopSecretinaBubble?: () => Promise<boolean>;
  isSecretinaBubbleRunning?: () => Promise<boolean>;
  isSecretinaBubbleEnabled?: () => Promise<boolean>;
};

const native = NativeModules.CallDetectionManagerAndroid as
  | BubbleNative
  | undefined;

export function isBubbleOverlaySupported(): boolean {
  return Platform.OS === 'android' && !!native?.startSecretinaBubble;
}

export async function canDrawOverlays(): Promise<boolean> {
  if (!native?.canDrawOverlays) return false;
  return native.canDrawOverlays();
}

export async function openOverlayPermissionSettings(): Promise<void> {
  await native?.openOverlayPermissionSettings?.();
}

export async function startSecretinaBubble(): Promise<void> {
  if (!native?.startSecretinaBubble) {
    throw new Error('Bolha flutuante só no APK Android do SeCretina.');
  }
  await native.startSecretinaBubble();
}

export async function stopSecretinaBubble(): Promise<void> {
  await native?.stopSecretinaBubble?.();
}

export async function isSecretinaBubbleRunning(): Promise<boolean> {
  if (!native?.isSecretinaBubbleRunning) return false;
  return native.isSecretinaBubbleRunning();
}

export async function isSecretinaBubbleEnabled(): Promise<boolean> {
  if (!native?.isSecretinaBubbleEnabled) return false;
  return native.isSecretinaBubbleEnabled();
}

/** Activa a bolha; se faltar permissão, abre as definições do sistema. */
export async function enableSecretinaBubble(): Promise<
  'ok' | 'need_permission'
> {
  const allowed = await canDrawOverlays();
  if (!allowed) {
    await openOverlayPermissionSettings();
    return 'need_permission';
  }
  await startSecretinaBubble();
  // Pequena pausa para o serviço nativo anexar a bolha
  await new Promise((r) => setTimeout(r, 400));
  const running = await isSecretinaBubbleRunning();
  if (!running) {
    throw new Error(
      'A bolha não arrancou. Reinstale o APK mais recente e confirme a permissão «Aparecer sobre outros apps».'
    );
  }
  return 'ok';
}
