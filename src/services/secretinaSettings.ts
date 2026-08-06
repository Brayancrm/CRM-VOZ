import { getAppSetting, setAppSetting } from '@/db/repositories/appSettings';
import { isOpenAiProxyConfigured } from '@/services/openaiProxy';
import { normalizeSpoken } from '@/utils/normalizeSpoken';

const KEY_WAKE_NAME = 'secretina_wake_name';
const KEY_VOICE_GENDER = 'secretina_voice_gender';
/** Legado — chave sk- no telemóvel; limpa-se ao guardar o servidor. */
const KEY_OPENAI_LEGACY = 'secretina_openai_api_key';

export type SecretinaVoiceGender = 'female' | 'male';

const DEFAULT_WAKE_NAME = 'SeCretina';

const GREETING_RE =
  /\b(ola|oi|ei|hey|eai|hola|hello|hi|ey|e\s*ai)\b/;

export async function getWakeName(): Promise<string> {
  const saved = (await getAppSetting(KEY_WAKE_NAME))?.trim();
  return saved || DEFAULT_WAKE_NAME;
}

export async function setWakeName(name: string): Promise<void> {
  const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, 32);
  await setAppSetting(KEY_WAKE_NAME, cleaned || DEFAULT_WAKE_NAME);
}

export async function getVoiceGender(): Promise<SecretinaVoiceGender> {
  const v = await getAppSetting(KEY_VOICE_GENDER);
  return v === 'male' ? 'male' : 'female';
}

export async function setVoiceGender(
  gender: SecretinaVoiceGender
): Promise<void> {
  await setAppSetting(KEY_VOICE_GENDER, gender);
}

/** Remove chave sk- antiga do armazenamento local (privacidade). */
export async function clearLegacyOpenAiApiKey(): Promise<void> {
  await setAppSetting(KEY_OPENAI_LEGACY, '');
}

/**
 * True se o proxy Railway está configurado (voz + interpretação).
 * A chave OpenAI fica só no servidor.
 */
export async function hasOpenAiApiKey(): Promise<boolean> {
  return isOpenAiProxyConfigured();
}

/** OpenAI TTS voice id conforme o género (gpt-4o-mini-tts). */
export async function getOpenAiTtsVoice(): Promise<string> {
  const gender = await getVoiceGender();
  return gender === 'male' ? 'ash' : 'coral';
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Variantes comuns que o STT inventa para «SeCretina». */
function nameVariants(name: string): string[] {
  const n = normalizeSpoken(name);
  const out = new Set<string>([n]);
  if (n.includes('secretina') || n === 'secretina' || n.startsWith('secret')) {
    out.add('secretina');
    out.add('secretaria');
    out.add('secretária');
    out.add('se cretina');
    out.add('secre tina');
  }
  // sem espaços
  out.add(n.replace(/\s+/g, ''));
  return [...out].map((x) => normalizeSpoken(x)).filter((x) => x.length >= 2);
}

function textIncludesName(spokenNorm: string, wakeName: string): boolean {
  for (const variant of nameVariants(wakeName)) {
    const re = new RegExp(
      `(^|[^a-z0-9])${escapeRegExp(variant).replace(/\s+/g, '\\s*')}([^a-z0-9]|$)`
    );
    if (re.test(spokenNorm)) return true;
    if (spokenNorm.includes(variant.replace(/\s+/g, ''))) return true;
  }
  return false;
}

/**
 * Detecta «olá/hola/hello {nome}», «oi {nome}», nome sozinho, etc.
 * Tolerante a STT (acentos, «secretaria», cumprimentos separados).
 */
export function matchesWakePhrase(spoken: string, wakeName: string): boolean {
  const n = normalizeSpoken(spoken);
  const name = normalizeSpoken(wakeName);
  if (!n || !name || name.length < 2) return false;

  const hasName = textIncludesName(n, wakeName);
  if (!hasName) return false;

  // Cumprimento + nome (ordem livre: «Bruno olá» também)
  if (GREETING_RE.test(n)) return true;

  // Só o nome (frase curta)
  const compact = n.replace(/\s+/g, '');
  const nameCompact = name.replace(/\s+/g, '');
  if (compact === nameCompact) return true;
  if (n.length <= name.length + 18 && hasName) return true;

  return false;
}

export function stripWakeFromText(spoken: string, wakeName: string): string {
  const name = normalizeSpoken(wakeName);
  let t = normalizeSpoken(spoken);
  t = t.replace(GREETING_RE, ' ');
  for (const variant of nameVariants(wakeName)) {
    t = t.replace(
      new RegExp(escapeRegExp(variant).replace(/\s+/g, '\\s*'), 'g'),
      ' '
    );
  }
  // também tenta o nome original
  t = t.replace(new RegExp(escapeRegExp(name).replace(/\s+/g, '\\s*'), 'g'), ' ');
  return t.replace(/\s+/g, ' ').trim();
}

export { DEFAULT_WAKE_NAME };
