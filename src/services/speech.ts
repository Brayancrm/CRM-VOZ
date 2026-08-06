import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { stopAudio } from '@/services/audioPlayback';
import {
  clearGreetCache,
  prefetchPodeFalar,
  speakWithOpenAiTts,
  stopOpenAiTts,
} from '@/services/openaiTts';
import { isOpenAiProxyConfigured } from '@/services/openaiProxy';
import { getSpeechLocale } from '@/services/secretinaLanguage';

export { prefetchPodeFalar, clearGreetCache };

let speaking = false;
let speakGeneration = 0;

const MAX_CHUNK_LEN = 320;

function splitForTts(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= MAX_CHUNK_LEN) return [trimmed];

  const chunks: string[] = [];
  let rest = trimmed;
  while (rest.length > MAX_CHUNK_LEN) {
    let cut = rest.lastIndexOf('. ', MAX_CHUNK_LEN);
    if (cut < 40) cut = rest.lastIndexOf(' ', MAX_CHUNK_LEN);
    if (cut < 40) cut = MAX_CHUNK_LEN;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter(Boolean);
}

async function prepareAudioModeForSpeech(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    });
  } catch {
    /* modo de áudio opcional */
  }
}

async function pickSpeechVoice(
  localeHint?: string
): Promise<{ language?: string; voice?: string }> {
  const preferred = (localeHint || 'pt-BR').toLowerCase();
  const prefix = preferred.split('-')[0]; // pt | es | en
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const exact = voices.find((v) =>
      v.language?.toLowerCase().startsWith(preferred)
    );
    if (exact?.identifier) {
      return { language: exact.language, voice: exact.identifier };
    }
    const byLang = voices.find((v) =>
      v.language?.toLowerCase().startsWith(prefix)
    );
    if (byLang?.identifier) {
      return { language: byLang.language, voice: byLang.identifier };
    }
  } catch {
    /* vozes opcionais */
  }
  return { language: localeHint || 'pt-BR' };
}

function speakChunk(
  text: string,
  generation: number,
  voiceOpts: { language?: string; voice?: string }
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let started = false;
    const finish = (ok: boolean) => {
      if (settled || generation !== speakGeneration) return;
      settled = true;
      speaking = false;
      resolve(ok);
    };

    const timeout = setTimeout(() => {
      finish(started);
    }, Math.max(12_000, text.length * 100));

    Speech.speak(text, {
      language: voiceOpts.language ?? 'pt-BR',
      voice: voiceOpts.voice,
      rate: Platform.OS === 'android' ? 0.88 : 0.95,
      pitch: 1.0,
      onStart: () => {
        started = true;
        speaking = true;
      },
      onDone: () => {
        clearTimeout(timeout);
        finish(started);
      },
      onStopped: () => {
        clearTimeout(timeout);
        finish(started);
      },
      onError: () => {
        clearTimeout(timeout);
        finish(false);
      },
    });
  });
}

async function speakLocal(text: string, generation: number): Promise<boolean> {
  await prepareAudioModeForSpeech();
  if (Platform.OS === 'android') {
    await new Promise((r) => setTimeout(r, 280));
  }
  const locale = await getSpeechLocale();
  const voiceOpts = await pickSpeechVoice(locale);
  const chunks = splitForTts(text);
  let any = false;
  for (const chunk of chunks) {
    if (generation !== speakGeneration) return false;
    const ok = await speakChunk(chunk, generation, voiceOpts);
    if (ok) any = true;
  }
  return any;
}

export type SpeakResult = {
  /** true se o utilizador chegou a ouvir áudio */
  heard: boolean;
};

/**
 * Fala o texto. Preferência: OpenAI natural.
 * `maxMs` limita o tempo total (ex.: cumprimento rápido).
 */
export async function speakText(
  text: string,
  opts?: { maxMs?: number; settleMs?: number }
): Promise<SpeakResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { heard: false };
  }

  speakGeneration += 1;
  const generation = speakGeneration;
  const maxMs = opts?.maxMs ?? 22_000;
  const settleMs = opts?.settleMs ?? (Platform.OS === 'android' ? 700 : 0);

  await stopAudio();
  Speech.stop();
  await stopOpenAiTts();
  speaking = false;
  speaking = true;

  const run = async (): Promise<boolean> => {
    if (generation !== speakGeneration) return false;

    let heard = false;
    if (await isOpenAiProxyConfigured()) {
      try {
        heard = await speakWithOpenAiTts(trimmed);
      } catch (e) {
        console.warn('OpenAI TTS falhou, fallback local', e);
        heard = false;
      }
    }

    if (generation !== speakGeneration) return false;

    if (!heard) {
      heard = await speakLocal(trimmed, generation);
    }

    if (
      heard &&
      generation === speakGeneration &&
      settleMs > 0
    ) {
      await new Promise((r) => setTimeout(r, settleMs));
    }
    return heard;
  };

  try {
    const heard = await Promise.race([
      run(),
      new Promise<boolean>((resolve) => {
        setTimeout(() => {
          if (generation === speakGeneration) {
            void stopSpeaking();
          }
          resolve(false);
        }, maxMs);
      }),
    ]);
    return { heard };
  } finally {
    if (generation === speakGeneration) {
      speaking = false;
    }
  }
}

/** Para tudo e limpa cache de cumprimento (ex.: troca de idioma). */
export async function hardResetVoicePipeline(): Promise<void> {
  await stopSpeaking();
  await clearGreetCache();
  await prefetchPodeFalar();
}

export async function stopSpeaking(): Promise<void> {
  speakGeneration += 1;
  Speech.stop();
  await stopOpenAiTts();
  speaking = false;
}

export function isSpeaking(): boolean {
  return speaking;
}
