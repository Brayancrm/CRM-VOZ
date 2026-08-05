import { AppState, NativeModules, Platform } from 'react-native';

export type NativeRecordingState = {
  recording: boolean;
  sessionId: string;
  phone: string;
  startedAt: number;
};

export type FinishedNativeRecording = {
  sessionId: string;
  phone: string;
  audioPath: string;
  audioUri?: string;
  fileSizeBytes?: number;
  startedAt: number;
  endedAt: number;
};

type NativeModule = {
  getNativeCallRecordingState?: () => Promise<NativeRecordingState>;
  consumeNativeCallRecording?: () => Promise<FinishedNativeRecording | null>;
  getRecordingLastError?: () => Promise<string>;
  getRecordingDiagnostics?: () => Promise<string>;
  abandonNativeRecording?: () => Promise<boolean>;
  bringAppToForeground?: () => void;
  updateRecordingDisplayName?: (name: string) => void;
  playLocalAudioFile?: (uri: string) => Promise<boolean>;
  stopLocalAudioPlayback?: () => Promise<boolean>;
};

const native = NativeModules.CallDetectionManagerAndroid as NativeModule | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function isAppInForeground(): boolean {
  return AppState.currentState === 'active';
}

export async function abandonNativeRecording(): Promise<void> {
  if (Platform.OS !== 'android' || !native?.abandonNativeRecording) return;
  try {
    await native.abandonNativeRecording();
    await sleep(280);
  } catch {
    /* ignorar */
  }
}

/** Espera o AudioRecord nativo libertar o microfone antes do Expo gravar. */
export async function waitForNativeRecordingReleased(
  maxWaitMs = 3500
): Promise<void> {
  if (Platform.OS !== 'android' || !native?.getNativeCallRecordingState) return;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const st = await getNativeCallRecordingState();
    if (!st?.recording) return;
    await sleep(100);
  }
}

export async function getNativeCallRecordingState(): Promise<NativeRecordingState | null> {
  if (Platform.OS !== 'android' || !native?.getNativeCallRecordingState) {
    return null;
  }
  try {
    const raw = await native.getNativeCallRecordingState();
    return {
      recording: Boolean(raw.recording),
      sessionId: raw.sessionId ?? '',
      phone: raw.phone ?? '',
      startedAt: Number(raw.startedAt) || 0,
    };
  } catch {
    return null;
  }
}

export async function consumeNativeCallRecording(): Promise<FinishedNativeRecording | null> {
  if (Platform.OS !== 'android' || !native?.consumeNativeCallRecording) {
    return null;
  }
  try {
    const raw = await native.consumeNativeCallRecording();
        if (!raw?.sessionId) return null;
        return {
          sessionId: raw.sessionId,
          phone: raw.phone ?? '',
          audioPath: raw.audioPath ?? '',
      audioUri: raw.audioUri,
      fileSizeBytes: Number(raw.fileSizeBytes) || undefined,
      startedAt: Number(raw.startedAt) || 0,
      endedAt: Number(raw.endedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export async function consumeNativeCallRecordingWithRetry(
  attempts = 8,
  delayMs = 500
): Promise<FinishedNativeRecording | null> {
  for (let i = 0; i < attempts; i++) {
    const result = await consumeNativeCallRecording();
    if (result) return result;
    if (i < attempts - 1) await sleep(delayMs);
  }
  return null;
}

export async function getRecordingLastError(): Promise<string> {
  if (Platform.OS !== 'android' || !native?.getRecordingLastError) return '';
  try {
    return (await native.getRecordingLastError()) ?? '';
  } catch {
    return '';
  }
}

export async function getRecordingDiagnostics(): Promise<string> {
  if (Platform.OS !== 'android' || !native?.getRecordingDiagnostics) return '';
  try {
    return (await native.getRecordingDiagnostics()) ?? '';
  } catch {
    return '';
  }
}

export function updateNativeRecordingDisplayName(name: string): void {
  if (Platform.OS !== 'android' || !native?.updateRecordingDisplayName) return;
  try {
    native.updateRecordingDisplayName(name);
  } catch {
    /* opcional */
  }
}

export async function isNativeCallRecording(): Promise<boolean> {
  const state = await getNativeCallRecordingState();
  return Boolean(state?.recording);
}

export function bringAppToForeground(): void {
  if (Platform.OS !== 'android' || !native?.bringAppToForeground) return;
  try {
    native.bringAppToForeground();
  } catch {
    /* opcional */
  }
}

export async function playNativeLocalAudio(uri: string): Promise<void> {
  if (Platform.OS !== 'android' || !native?.playLocalAudioFile) {
    throw new Error('Reprodução nativa indisponível neste dispositivo.');
  }
  await native.playLocalAudioFile(uri);
}

export async function stopNativeLocalAudio(): Promise<void> {
  if (Platform.OS !== 'android' || !native?.stopLocalAudioPlayback) return;
  try {
    await native.stopLocalAudioPlayback();
  } catch {
    /* opcional */
  }
}
