import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

export function normalizeAudioUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('file://')) return trimmed;
  if (trimmed.startsWith('/')) return `file://${trimmed}`;
  return trimmed;
}

export async function validateRecordingFile(
  uri: string
): Promise<{ ok: boolean; normalizedUri: string; size: number; reason?: string }> {
  const normalizedUri = normalizeAudioUri(uri);
  try {
    const info = await FileSystem.getInfoAsync(normalizedUri);
    if (!info.exists) {
      return {
        ok: false,
        normalizedUri,
        size: 0,
        reason: 'Arquivo de áudio não encontrado no celular.',
      };
    }
    const size =
      'size' in info && typeof info.size === 'number' ? info.size : 0;
    if (size < 8_000) {
      return {
        ok: false,
        normalizedUri,
        size,
        reason:
          'Gravação vazia ou muito curta — fale por alguns segundos.',
      };
    }
    return { ok: true, normalizedUri, size };
  } catch {
    return {
      ok: false,
      normalizedUri,
      size: 0,
      reason: 'Não foi possível ler o arquivo de áudio.',
    };
  }
}

/** KooMind grava WAV mono 8 kHz ou 16 kHz — não assumir 44,1 kHz. */
function estimateWavDurationMs(fileSize: number, sampleRate = 16_000): number {
  const pcmBytes = Math.max(0, fileSize - 44);
  return (pcmBytes / (sampleRate * 2)) * 1000;
}

function bestWavDurationEstimate(fileSize: number): number {
  const pcmBytes = Math.max(0, fileSize - 44);
  if (pcmBytes <= 0) return 0;
  const rates = [16_000, 8_000, 44_100];
  return Math.max(...rates.map((r) => estimateWavDurationMs(fileSize, r)));
}

export function audioSourceForUri(uri: string): { uri: string; overrideFileExtensionAndroid?: string } {
  const normalized = normalizeAudioUri(uri);
  const lower = normalized.toLowerCase();
  if (lower.includes('.wav')) {
    return { uri: normalized, overrideFileExtensionAndroid: 'wav' };
  }
  if (lower.includes('.m4a')) {
    return { uri: normalized, overrideFileExtensionAndroid: 'm4a' };
  }
  return { uri: normalized };
}

const MIN_PLAYBACK_BYTES = 2_000;

/** Valida ficheiro para reprodução (limiar mais baixo que transcrição). */
export async function validateRecordingForPlayback(
  uri: string
): Promise<{ ok: boolean; normalizedUri: string; size: number; reason?: string }> {
  const normalizedUri = normalizeAudioUri(uri);
  try {
    const info = await FileSystem.getInfoAsync(normalizedUri);
    if (!info.exists) {
      return {
        ok: false,
        normalizedUri,
        size: 0,
        reason: 'Arquivo de áudio não encontrado no celular.',
      };
    }
    const size =
      'size' in info && typeof info.size === 'number' ? info.size : 0;
    if (size < MIN_PLAYBACK_BYTES) {
      return {
        ok: false,
        normalizedUri,
        size,
        reason: 'Gravação vazia ou muito curta.',
      };
    }
    return { ok: true, normalizedUri, size };
  } catch {
    return {
      ok: false,
      normalizedUri,
      size: 0,
      reason: 'Não foi possível ler o arquivo de áudio.',
    };
  }
}

/** Confirma que o player consegue abrir o arquivo (evita “áudio salvo” falso). */
export async function probeAudioPlayable(uri: string): Promise<{
  ok: boolean;
  normalizedUri: string;
  durationMs: number;
  reason?: string;
}> {
  const base = await validateRecordingFile(uri);
  if (!base.ok) {
    return {
      ok: false,
      normalizedUri: base.normalizedUri,
      durationMs: 0,
      reason: base.reason,
    };
  }

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      playThroughEarpieceAndroid: false,
    });
    const { sound } = await Audio.Sound.createAsync(
      audioSourceForUri(base.normalizedUri),
      { shouldPlay: false }
    );
    const status = await sound.getStatusAsync();
    await sound.unloadAsync();

    if (!status.isLoaded) {
      return {
        ok: false,
        normalizedUri: base.normalizedUri,
        durationMs: 0,
        reason: 'Arquivo de áudio corrompido ou incompatível.',
      };
    }

    const durationMs =
      status.durationMillis && status.durationMillis > 0
        ? status.durationMillis
        : bestWavDurationEstimate(base.size);

    if (durationMs < 800) {
      return {
        ok: false,
        normalizedUri: base.normalizedUri,
        durationMs,
        reason:
          'Quase sem áudio útil — na ligação use viva-voz e fale por mais tempo.',
      };
    }

    return { ok: true, normalizedUri: base.normalizedUri, durationMs };
  } catch {
    return {
      ok: false,
      normalizedUri: base.normalizedUri,
      durationMs: 0,
      reason: 'Não foi possível reproduzir — gravação inválida neste aparelho.',
    };
  }
}
