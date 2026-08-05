/** Frases comuns quando o Whisper recebe áudio vazio, ruído ou TV de fundo. */
const WHISPER_HALLUCINATION_PATTERNS = [
  /legendas pela comunidade amara/i,
  /subtitles by the amara/i,
  /obrigado por assistir/i,
  /thanks for watching/i,
  /inscreva-se no canal/i,
  /veja como aumentar/i,
  /ganhar muito bumbum/i,
  /gluteos/i,
  /supporter-members/i,
  /flamengo/i,
  /have more flamengo/i,
  /inscreva-se e ative o sininho/i,
  /www\./i,
  /http/i,
  /transcri[cç][aã]o\s*vazia/i,
  /transcription\s*(is\s*)?empty/i,
];

/** ~2 s de fala útil em AAC/WAV curto */
const MIN_AUDIO_BYTES = 8_000;

const MIN_DURATION_MS = 800;

export function isAudioLargeEnoughForTranscription(
  sizeBytes: number | undefined,
  durationMs?: number
): boolean {
  if (sizeBytes == null || !Number.isFinite(sizeBytes)) return false;
  if (sizeBytes < MIN_AUDIO_BYTES) return false;
  if (durationMs != null && durationMs > 0 && durationMs < MIN_DURATION_MS) {
    return false;
  }
  return true;
}

function normalizedCompact(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Texto repetido ou metade duplicada (ex.: "FLAMENGO ... FLAMENGO"). */
function hasRepeatedContent(text: string): boolean {
  const compact = normalizedCompact(text);
  if (compact.length < 16) return false;

  const mid = Math.floor(compact.length / 2);
  const first = compact.slice(0, mid).trim();
  const second = compact.slice(mid).trim();
  if (first.length >= 8 && first === second) return true;
  if (first.length >= 10 && second.startsWith(first.slice(0, Math.min(first.length, 12)))) {
    return true;
  }

  const words = compact.split(' ').filter((w) => w.length > 2);
  if (words.length >= 8) {
    const unique = new Set(words);
    if (unique.size <= Math.max(2, Math.floor(words.length * 0.35))) {
      return true;
    }
  }

  return false;
}

export function isLikelySilentTranscription(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length < 4) return true;
  if (WHISPER_HALLUCINATION_PATTERNS.some((re) => re.test(t))) return true;
  if (hasRepeatedContent(t)) return true;
  return false;
}
