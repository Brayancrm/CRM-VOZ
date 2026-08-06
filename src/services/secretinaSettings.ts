import { getAppSetting, setAppSetting } from '@/db/repositories/appSettings';
import { isOpenAiProxyConfigured } from '@/services/openaiProxy';
import { normalizeSpoken } from '@/utils/normalizeSpoken';

const KEY_WAKE_NAME = 'secretina_wake_name';
const KEY_VOICE_GENDER = 'secretina_voice_gender';
/** Legado — chave sk- no telemóvel; limpa-se ao guardar o servidor. */
const KEY_OPENAI_LEGACY = 'secretina_openai_api_key';

export type SecretinaVoiceGender = 'female' | 'male';

const DEFAULT_WAKE_NAME = 'SeCretina';

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
  // coral ≈ feminina natural pt; ash ≈ masculina natural
  return gender === 'male' ? 'ash' : 'coral';
}

/**
 * Detecta «olá/hola/hello {nome}», «oi {nome}», etc.
 * Nome pode ter várias palavras (ex.: «Secretária Ana»).
 */
export function matchesWakePhrase(spoken: string, wakeName: string): boolean {
  const n = normalizeSpoken(spoken);
  const name = normalizeSpoken(wakeName);
  if (!n || !name || name.length < 2) return false;

  const nameRe = name.replace(/\s+/g, '\\s+');
  // pt: ola/oi/ei/eai · es: hola · en: hello/hi · comum: hey
  if (
    new RegExp(
      `\\b(ola|oi|ei|hey|eai|hola|hello|hi)\\s+${nameRe}\\b`
    ).test(n)
  ) {
    return true;
  }
  if (new RegExp(`^${nameRe}$`).test(n)) return true;
  // Nome sozinho no início de frase curta («SeCretina, …»)
  if (
    n.length <= name.length + 16 &&
    new RegExp(`^${nameRe}\\b`).test(n)
  ) {
    return true;
  }
  return false;
}

export function stripWakeFromText(spoken: string, wakeName: string): string {
  const name = normalizeSpoken(wakeName).replace(/\s+/g, '\\s+');
  let t = spoken.trim();
  t = t.replace(
    new RegExp(
      `^(olá|ola|oi|ei|hey|eai|hola|hello|hi)\\s+${name}\\s*[,.]?\\s*`,
      'i'
    ),
    ''
  );
  t = t.replace(new RegExp(`^${name}\\s*[,.]?\\s*`, 'i'), '');
  return t.trim();
}

export { DEFAULT_WAKE_NAME };
