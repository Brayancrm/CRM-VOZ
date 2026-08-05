import { Linking, NativeModules, Platform } from 'react-native';

export type HelperStatus = {
  installed: boolean;
  connectorEnabled: boolean;
};

type HelperNativeModule = {
  getHelperStatus?: () => Promise<HelperStatus>;
  openHelperAccessibilitySettings?: () => Promise<boolean>;
  openHelperAppDetails?: () => Promise<boolean>;
};

const native = NativeModules.CallDetectionManagerAndroid as
  | HelperNativeModule
  | undefined;

export const HELPER_PACKAGE = 'com.koomind.helper';

export async function getHelperStatus(): Promise<HelperStatus> {
  if (Platform.OS !== 'android' || !native?.getHelperStatus) {
    return { installed: false, connectorEnabled: false };
  }
  try {
    const raw = await native.getHelperStatus();
    return {
      installed: Boolean(raw?.installed),
      connectorEnabled: Boolean(raw?.connectorEnabled),
    };
  } catch {
    return { installed: false, connectorEnabled: false };
  }
}

export async function openHelperAccessibilitySettings(): Promise<void> {
  if (Platform.OS !== 'android' || !native?.openHelperAccessibilitySettings) {
    return;
  }
  await native.openHelperAccessibilitySettings();
}

export async function openHelperRestrictedSettings(): Promise<void> {
  if (Platform.OS !== 'android' || !native?.openHelperAppDetails) {
    return;
  }
  await native.openHelperAppDetails();
}

/** Abre pasta dist/ no explorador — utilizador instala KooMindHelper.apk manualmente. */
export function getHelperInstallHint(): string {
  return (
    'Instale dist/KooMindHelper.apk (ou npm run build:helper:release). ' +
    'Android 13+: Definições → Apps → KooMind Helper → ⋮ → Permitir definições restritas. ' +
    'Depois active «KooMind App Connector» em Acessibilidade.'
  );
}

export async function openHelperPlayStoreFallback(): Promise<void> {
  const market = `market://details?id=${HELPER_PACKAGE}`;
  const web = `https://play.google.com/store/apps/details?id=${HELPER_PACKAGE}`;
  try {
    await Linking.openURL(market);
  } catch {
    await Linking.openURL(web);
  }
}
