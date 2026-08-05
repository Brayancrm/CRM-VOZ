import { Linking, NativeModules, Platform } from 'react-native';

type DeviceSetupNative = {
  isIgnoringBatteryOptimizations?: () => Promise<boolean>;
  requestIgnoreBatteryOptimizations?: () => Promise<boolean>;
  openBatteryOptimizationSettings?: () => Promise<boolean>;
};

const native = NativeModules.CallDetectionManagerAndroid as
  | DeviceSetupNative
  | undefined;

export async function isBatteryOptimizationDisabled(): Promise<boolean> {
  if (Platform.OS !== 'android' || !native?.isIgnoringBatteryOptimizations) {
    return true;
  }
  try {
    return Boolean(await native.isIgnoringBatteryOptimizations());
  } catch {
    return false;
  }
}

export async function requestIgnoreBatteryOptimizations(): Promise<void> {
  if (Platform.OS !== 'android' || !native?.requestIgnoreBatteryOptimizations) {
    return;
  }
  await native.requestIgnoreBatteryOptimizations();
}

export async function openBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== 'android' || !native?.openBatteryOptimizationSettings) {
    await Linking.openSettings();
    return;
  }
  try {
    await native.openBatteryOptimizationSettings();
  } catch {
    await Linking.openSettings();
  }
}

/** Abre ecrã Samsung «Gerenciar app se não usada» via configurações do app. */
export function openUnusedAppSettings(): void {
  void Linking.openSettings();
}

export type RecordingSetupCheck = {
  batteryOk: boolean;
};

export async function checkRecordingSetup(): Promise<RecordingSetupCheck> {
  return {
    batteryOk: await isBatteryOptimizationDisabled(),
  };
}
