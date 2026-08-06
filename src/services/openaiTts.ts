import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import {
  getOpenAiProxyBaseUrl,
  openAiProxyAuthHeaders,
} from '@/services/openaiProxy';
import {
  getOpenAiTtsVoice,
  getVoiceGender,
} from '@/services/secretinaSettings';
import {
  getCanSpeakPhrase,
  getSecretinaLanguage,
} from '@/services/secretinaLanguage';

let currentSound: Audio.Sound | null = null;

/** Cache do cumprimento por voz+idioma. */
const greetFileByKey: Record<string, string> = {};

function bytesToBase64(bytes: Uint8Array): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (a << 16) | (b << 8) | c;
    result += chars[(triplet >> 18) & 63];
    result += chars[(triplet >> 12) & 63];
    result += i + 1 < bytes.length ? chars[(triplet >> 6) & 63] : '=';
    result += i + 2 < bytes.length ? chars[triplet & 63] : '=';
  }
  return result;
}

async function preparePlaybackMode(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: false,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
  });
  // Samsung: dá tempo ao AudioFlinger
  await new Promise((r) => setTimeout(r, 180));
}

export async function stopOpenAiTts(): Promise<void> {
  if (currentSound) {
    try {
      await currentSound.stopAsync();
    } catch {
      /* ignore */
    }
    try {
      await currentSound.unloadAsync();
    } catch {
      /* ignore */
    }
    currentSound = null;
  }
}

async function fetchSpeechMp3(
  text: string,
  voice: string
): Promise<Uint8Array | null> {
  const baseUrl = await getOpenAiProxyBaseUrl();
  if (!baseUrl) return null;

  const gender = await getVoiceGender();
  const language = await getSecretinaLanguage();
  const headers = {
    'Content-Type': 'application/json',
    ...(await openAiProxyAuthHeaders()),
  };

  let response: Response;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      response = await fetch(`${baseUrl}/api/secretina/tts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: text.slice(0, 4000),
          voice,
          gender,
          language,
        }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.warn('OpenAI TTS proxy network', e);
    return null;
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.warn('OpenAI TTS proxy', response.status, errText.slice(0, 200));
    return null;
  }

  const buf = await response.arrayBuffer();
  if (!buf || buf.byteLength < 500) {
    console.warn('OpenAI TTS áudio vazio/curto', buf?.byteLength);
    return null;
  }
  return new Uint8Array(buf);
}

async function writeMp3File(bytes: Uint8Array, tag: string): Promise<string | null> {
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) return null;
  const path = `${dir}secretina-tts-${tag}-${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(path, bytesToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

/**
 * Reproduz ficheiro e SÓ resolve depois de ter começado e terminado.
 * Devolve false se não houve reprodução real.
 */
async function playMp3File(path: string): Promise<boolean> {
  await preparePlaybackMode();
  await stopOpenAiTts();

  const { sound } = await Audio.Sound.createAsync(
    { uri: path },
    { shouldPlay: false, volume: 1.0, progressUpdateIntervalMillis: 100 }
  );
  currentSound = sound;

  let started = false;
  let finished = false;

  const done = new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      resolve(started);
    }, 30_000);

    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) {
        if ('error' in status && status.error) {
          clearTimeout(timeout);
          resolve(false);
        }
        return;
      }
      if (status.isPlaying || (status.positionMillis ?? 0) > 0) {
        started = true;
      }
      if (status.didJustFinish) {
        finished = true;
        clearTimeout(timeout);
        resolve(true);
      }
    });
  });

  try {
    await sound.playAsync();
  } catch (e) {
    console.warn('OpenAI TTS playAsync', e);
    await stopOpenAiTts();
    return false;
  }

  const ok = await done;
  await stopOpenAiTts();
  return ok && (finished || started);
}

/**
 * Fala com OpenAI TTS via proxy Railway. Devolve true só se o áudio tocou.
 */
export async function speakWithOpenAiTts(text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const baseUrl = await getOpenAiProxyBaseUrl();
  if (!baseUrl) return false;

  const voice = await getOpenAiTtsVoice();
  const language = await getSecretinaLanguage();
  const greet = await getCanSpeakPhrase();
  const cacheKey = `${voice}:${language}`;
  const isGreet =
    normalizeGreet(trimmed) === normalizeGreet(greet) ||
    /^pode falar\.?$/i.test(trimmed) ||
    /^puede hablar\.?$/i.test(trimmed) ||
    /^you can speak\.?$/i.test(trimmed);

  if (isGreet && greetFileByKey[cacheKey]) {
    try {
      const info = await FileSystem.getInfoAsync(greetFileByKey[cacheKey]);
      if (info.exists) {
        const played = await playMp3File(greetFileByKey[cacheKey]);
        if (played) return true;
      }
    } catch {
      /* regenera abaixo */
    }
  }

  const bytes = await fetchSpeechMp3(trimmed, voice);
  if (!bytes) return false;

  const path = await writeMp3File(bytes, `${voice}-${language}`);
  if (!path) return false;

  if (isGreet) {
    greetFileByKey[cacheKey] = path;
  }

  try {
    const played = await playMp3File(path);
    if (!isGreet) {
      try {
        await FileSystem.deleteAsync(path, { idempotent: true });
      } catch {
        /* ignore */
      }
    }
    return played;
  } catch (e) {
    console.warn('OpenAI TTS play', e);
    return false;
  }
}

function normalizeGreet(s: string): string {
  return s.trim().toLowerCase().replace(/\.+$/, '');
}

/** Pré-aquece o cumprimento em background. */
export async function prefetchPodeFalar(): Promise<void> {
  const baseUrl = await getOpenAiProxyBaseUrl();
  if (!baseUrl) return;
  const voice = await getOpenAiTtsVoice();
  const language = await getSecretinaLanguage();
  const cacheKey = `${voice}:${language}`;
  if (greetFileByKey[cacheKey]) {
    try {
      const info = await FileSystem.getInfoAsync(greetFileByKey[cacheKey]);
      if (info.exists) return;
    } catch {
      /* continue */
    }
  }
  const phrase = await getCanSpeakPhrase();
  const bytes = await fetchSpeechMp3(phrase, voice);
  if (!bytes) return;
  const path = await writeMp3File(bytes, `greet-${voice}-${language}`);
  if (path) greetFileByKey[cacheKey] = path;
}

/** Limpa cache de cumprimentos (obrigatório ao mudar idioma/voz). */
export async function clearGreetCache(): Promise<void> {
  const paths = Object.values(greetFileByKey);
  for (const key of Object.keys(greetFileByKey)) {
    delete greetFileByKey[key];
  }
  await Promise.all(
    paths.map(async (path) => {
      try {
        await FileSystem.deleteAsync(path, { idempotent: true });
      } catch {
        /* ignore */
      }
    })
  );
}
