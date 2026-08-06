import { Platform } from 'react-native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import {
  DEFAULT_WAKE_NAME,
  matchesWakePhrase,
  stripWakeFromText,
} from '@/services/secretinaSettings';
import { getSpeechLocale } from '@/services/secretinaLanguage';

export async function ensureSpeechPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return Boolean(result.granted);
}

/** Liberta o modo de TTS e prepara o microfone para reconhecimento. */
export async function prepareMicForRecognition(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    });
  } catch {
    /* opcional */
  }
  await new Promise((r) => setTimeout(r, 450));
}

export async function startCommandRecognition(opts?: {
  /** Silêncio mais longo = menos cortes a meio da frase. */
  longUtterance?: boolean;
  lang?: string;
}): Promise<void> {
  const long = opts?.longUtterance !== false;
  const lang = opts?.lang ?? (await getSpeechLocale());
  ExpoSpeechRecognitionModule.start({
    lang,
    interimResults: true,
    continuous: Platform.OS === 'android',
    androidIntentOptions: {
      EXTRA_LANGUAGE_MODEL: 'web_search',
      EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: long ? 4500 : 2500,
      EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: long
        ? 3500
        : 2000,
      EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 1500,
    },
  });
}

/** @deprecated Use matchesWakePhrase com o nome configurado. */
export function containsWakePhrase(
  text: string,
  wakeName = DEFAULT_WAKE_NAME
): boolean {
  return matchesWakePhrase(text, wakeName);
}

export function stripWakePhrase(
  text: string,
  wakeName = DEFAULT_WAKE_NAME
): string {
  return stripWakeFromText(text, wakeName);
}

export function abortSpeechRecognition(): void {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    /* ignore */
  }
}
