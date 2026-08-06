import { normalizeSpoken } from '@/utils/normalizeSpoken';
import type { SecretinaLanguage } from '@/services/secretinaLanguage';
import {
  msgAmbiguousScreen,
  msgAmbiguousSpeak,
  msgNoContactsFound,
  msgOptionLabel,
  unnamedContact,
} from '@/services/secretinaSpeak';

/** Números falados em pt / es / en (normalizados sem acento). */
const SPOKEN_NUMBERS: Record<string, number> = {
  // pt
  um: 1,
  uma: 1,
  primeiro: 1,
  primeira: 1,
  dois: 2,
  segunda: 2,
  segundo: 2,
  tres: 3,
  terceiro: 3,
  terceira: 3,
  quatro: 4,
  quarto: 4,
  quarta: 4,
  cinco: 5,
  quinto: 5,
  quinta: 5,
  seis: 6,
  sexto: 6,
  sexta: 6,
  sete: 7,
  setimo: 7,
  oito: 8,
  oitavo: 8,
  nove: 9,
  nono: 9,
  dez: 10,
  decimo: 10,
  // es
  uno: 1,
  una: 1,
  dos: 2,
  // tres shared
  cuatro: 4,
  // cinco shared
  // seis shared
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  // en
  one: 1,
  first: 1,
  two: 2,
  second: 2,
  three: 3,
  third: 3,
  four: 4,
  fourth: 4,
  five: 5,
  fifth: 5,
  six: 6,
  sixth: 6,
  seven: 7,
  seventh: 7,
  eight: 8,
  eighth: 8,
  nine: 9,
  ninth: 9,
  ten: 10,
  tenth: 10,
};

type Named = { id: string; name: string };

/** Lista numerada para ecrã / TTS. Nomes de contactos ficam como estão. */
export function formatEnumeratedContacts(
  contacts: Named[],
  lang: SecretinaLanguage = 'pt-BR'
): string {
  return contacts
    .map((c, i) => `${i + 1}. ${c.name?.trim() || unnamedContact(lang)}`)
    .join('\n');
}

/**
 * Texto curto para a assistente falar.
 * Até 6 opções: lê número + nome. Acima disso: só pede o número.
 */
export function buildAmbiguousSpeakMessage(
  contacts: Named[],
  lang: SecretinaLanguage = 'pt-BR'
): string {
  const n = contacts.length;
  if (n === 0) return msgNoContactsFound(lang);
  const optionLines = contacts.map((c, i) => {
    const short = (c.name || unnamedContact(lang)).trim().slice(0, 40);
    return msgOptionLabel(lang, i + 1, short);
  });
  return msgAmbiguousSpeak(lang, n, optionLines);
}

export function buildAmbiguousScreenMessage(
  contacts: Named[],
  lang: SecretinaLanguage = 'pt-BR'
): string {
  const n = contacts.length;
  return msgAmbiguousScreen(
    lang,
    n,
    formatEnumeratedContacts(contacts, lang)
  );
}

/**
 * Extrai índice 1-based a partir de fala: «2», «number two», «opción 3», «opção 1».
 */
export function parseSpokenChoiceIndex(
  spoken: string,
  max: number
): number | null {
  const n = normalizeSpoken(spoken).trim();
  if (!n || max < 1) return null;

  const digit = n.match(
    /\b(?:numero|number|opcion|opcao|option|escolha|choice)?\s*(\d{1,2})\b/
  );
  if (digit) {
    const idx = Number(digit[1]);
    if (idx >= 1 && idx <= max) return idx;
  }

  const onlyNum = n.match(/^(\d{1,2})$/);
  if (onlyNum) {
    const idx = Number(onlyNum[1]);
    if (idx >= 1 && idx <= max) return idx;
  }

  const words = Object.entries(SPOKEN_NUMBERS).sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [word, idx] of words) {
    if (idx > max) continue;
    const re = new RegExp(
      `\\b(?:numero|number|opcion|opcao|option|a|o|the)?\\s*${word}\\b`
    );
    if (re.test(n)) return idx;
  }

  return null;
}
