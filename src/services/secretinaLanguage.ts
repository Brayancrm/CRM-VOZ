import { getAppSetting, setAppSetting } from '@/db/repositories/appSettings';

export type SecretinaLanguage = 'pt-BR' | 'es' | 'en';

const KEY_LANG = 'secretina_language';
const KEY_CHOSEN = 'secretina_language_chosen';

export type LanguageOption = {
  id: SecretinaLanguage;
  /** Nome no próprio idioma */
  label: string;
  /** Explicação curta no idioma */
  hint: string;
};

export const SECRETINA_LANGUAGES: LanguageOption[] = [
  {
    id: 'pt-BR',
    label: 'Português (Brasil)',
    hint: 'A assistente fala e ouve em português.',
  },
  {
    id: 'es',
    label: 'Español',
    hint: 'La asistente habla y escucha en español.',
  },
  {
    id: 'en',
    label: 'English',
    hint: 'The assistant speaks and listens in English.',
  },
];

export async function getSecretinaLanguage(): Promise<SecretinaLanguage> {
  const v = (await getAppSetting(KEY_LANG))?.trim();
  if (v === 'es' || v === 'en' || v === 'pt-BR') return v;
  return 'pt-BR';
}

export async function hasChosenSecretinaLanguage(): Promise<boolean> {
  const chosen = (await getAppSetting(KEY_CHOSEN))?.trim();
  if (chosen === '1' || chosen === 'true') return true;
  // Migração: se já guardou idioma explicitamente
  const v = (await getAppSetting(KEY_LANG))?.trim();
  return v === 'es' || v === 'en' || v === 'pt-BR';
}

export async function setSecretinaLanguage(
  lang: SecretinaLanguage
): Promise<void> {
  await setAppSetting(KEY_LANG, lang);
  await setAppSetting(KEY_CHOSEN, '1');
}

/** Locale do reconhecimento de voz. */
export function speechLocaleFor(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'es-ES';
  if (lang === 'en') return 'en-US';
  return 'pt-BR';
}

export async function getSpeechLocale(): Promise<string> {
  return speechLocaleFor(await getSecretinaLanguage());
}

/** Frase de cumprimento antes do mic. */
export function canSpeakPhrase(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'Puede hablar.';
  if (lang === 'en') return 'You can speak.';
  return 'Pode falar.';
}

export async function getCanSpeakPhrase(): Promise<string> {
  return canSpeakPhrase(await getSecretinaLanguage());
}

export function askScheduleNotePhrase(lang: SecretinaLanguage): string {
  if (lang === 'es') {
    return '¿Quiere añadir una nota a esta cita? Diga sí o no.';
  }
  if (lang === 'en') {
    return 'Would you like to add a note to this appointment? Say yes or no.';
  }
  return 'Quer acrescentar uma nota a este agendamento? Diga sim ou não.';
}

export function yesNoHint(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'Diga sí o no…';
  if (lang === 'en') return 'Say yes or no…';
  return 'Diga sim ou não…';
}

/** Instruções TTS OpenAI por idioma. */
export function ttsInstructionsFor(
  lang: SecretinaLanguage,
  gender: 'female' | 'male'
): string {
  if (lang === 'es') {
    return gender === 'male'
      ? 'Habla en español de forma natural y humana, como un asistente simpático y profesional. Tono cálido, ritmo conversacional, sin sonar robótico. Pronunciación clara.'
      : 'Habla en español de forma natural y humana, como una secretaria simpática y profesional. Tono cálido, ritmo conversacional, sin sonar robótica. Pronunciación clara.';
  }
  if (lang === 'en') {
    return gender === 'male'
      ? 'Speak in natural, human English like a friendly professional assistant. Warm tone, conversational pace, not robotic. Clear pronunciation.'
      : 'Speak in natural, human English like a friendly professional secretary. Warm tone, conversational pace, not robotic. Clear pronunciation.';
  }
  return gender === 'male'
    ? 'Fale em português brasileiro (Brasil), de forma natural e humana, como um assistente simpático e profissional. Tom caloroso, ritmo conversacional, sem soar robótico nem metálico. Pronúncia clara do Brasil.'
    : 'Fale em português brasileiro (Brasil), de forma natural e humana, como uma secretária simpática e profissional. Tom caloroso, ritmo conversacional, sem soar robótica nem metálica. Pronúncia clara do Brasil.';
}

/** Nome do idioma para o prompt GPT. */
export function languagePromptName(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'español';
  if (lang === 'en') return 'English';
  return 'português brasileiro (pt-BR)';
}
