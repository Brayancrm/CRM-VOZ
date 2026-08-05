import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import {
  playNativeLocalAudio,
  stopNativeLocalAudio,
} from '@/services/nativeCallRecording';
import {
  audioSourceForUri,
  bestWavDurationEstimate,
  normalizeAudioUri,
  probeAudioPlayable,
  validateRecordingForPlayback,
} from '@/utils/audioUri';

let sound: Audio.Sound | null = null;
let playing = false;
let nativePlaying = false;

export function isAudioPlaying(): boolean {
  return playing || nativePlaying;
}

async function resolvePlayableUri(uri: string): Promise<string> {
  const normalized = normalizeAudioUri(uri);
  const probe = await probeAudioPlayable(normalized);
  if (probe.ok) return probe.normalizedUri;

  const base = await validateRecordingForPlayback(normalized);
  if (!base.ok) {
    throw new Error(probe.reason ?? base.reason ?? 'Gravação inválida.');
  }
  return base.normalizedUri;
}

async function playWithExpoAv(normalizedUri: string): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    playThroughEarpieceAndroid: false,
    shouldDuckAndroid: true,
  });

  const { sound: s } = await Audio.Sound.createAsync(
    audioSourceForUri(normalizedUri),
    { shouldPlay: true, progressUpdateIntervalMillis: 250 },
    undefined,
    true
  );
  sound = s;
  playing = true;

  const fileInfo = await validateRecordingForPlayback(normalizedUri);
  const fallbackMs = bestWavDurationEstimate(fileInfo.size);
  const timeoutMs = Math.min(600_000, Math.max(15_000, fallbackMs + 8_000));

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        stopAudio().then(resolve).catch(reject);
      });
    }, timeoutMs);

    s.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) {
        if (status.error) {
          finish(() => {
            playing = false;
            reject(
              new Error(
                status.error ??
                  'Não foi possível abrir o áudio — a gravação pode estar vazia.'
              )
            );
          });
        }
        return;
      }
      if (status.didJustFinish) {
        finish(() => {
          stopAudio().then(resolve).catch(reject);
        });
      }
    });
  });
}

async function playWithNativePlayer(normalizedUri: string): Promise<void> {
  nativePlaying = true;
  try {
    await playNativeLocalAudio(normalizedUri);
  } finally {
    nativePlaying = false;
  }
}

export async function playAudioFile(uri: string): Promise<void> {
  const normalizedUri = await resolvePlayableUri(uri);
  await stopAudio();

  const preferNative =
    Platform.OS === 'android' &&
    normalizedUri.toLowerCase().includes('.wav');

  if (preferNative) {
    try {
      await playWithNativePlayer(normalizedUri);
      return;
    } catch {
      /* fallback expo-av */
    }
  }

  try {
    await playWithExpoAv(normalizedUri);
  } catch (expoErr) {
    if (Platform.OS === 'android') {
      try {
        await playWithNativePlayer(normalizedUri);
        return;
      } catch {
        /* mantém erro expo */
      }
    }
    throw expoErr instanceof Error
      ? expoErr
      : new Error('Não foi possível reproduzir o áudio.');
  }
}

export async function stopAudio(): Promise<void> {
  if (Platform.OS === 'android') {
    await stopNativeLocalAudio();
  }
  nativePlaying = false;

  if (!sound) {
    playing = false;
    return;
  }
  try {
    await sound.stopAsync();
    await sound.unloadAsync();
  } catch {
    /* já descarregado */
  }
  sound = null;
  playing = false;
}
