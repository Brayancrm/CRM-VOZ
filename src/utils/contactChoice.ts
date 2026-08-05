import { normalizeSpoken } from '@/utils/normalizeSpoken';

const SPOKEN_NUMBERS: Record<string, number> = {
  um: 1,
  uma: 1,
  primeiro: 1,
  primeira: 1,
  dois: 2,
  segunda: 2,
  segundo: 2,
  tres: 3,
  três: 3,
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
  sétimo: 7,
  oito: 8,
  oitavo: 8,
  nove: 9,
  nono: 9,
  dez: 10,
  decimo: 10,
  décimo: 10,
};

type Named = { id: string; name: string };

/** Lista numerada para ecrã / TTS. */
export function formatEnumeratedContacts(contacts: Named[]): string {
  return contacts
    .map((c, i) => `${i + 1}. ${c.name?.trim() || 'Sem nome'}`)
    .join('\n');
}

/**
 * Texto curto para a assistente falar.
 * Até 6 opções: lê número + nome. Acima disso: só pede o número.
 */
export function buildAmbiguousSpeakMessage(contacts: Named[]): string {
  const n = contacts.length;
  if (n === 0) return 'Não encontrei contactos.';
  if (n > 6) {
    return `Há ${n} contactos parecidos. Diga o número de 1 a ${n}, ou o sobrenome.`;
  }
  const parts = contacts.map((c, i) => {
    const short = (c.name || 'Sem nome').trim().slice(0, 40);
    return `Opção ${i + 1}: ${short}`;
  });
  return `${parts.join('. ')}. Diga o número ou o sobrenome.`;
}

export function buildAmbiguousScreenMessage(contacts: Named[]): string {
  const n = contacts.length;
  return (
    `Há ${n} contactos parecidos. Diga o número (1 a ${n}) ou o sobrenome:\n` +
    formatEnumeratedContacts(contacts)
  );
}

/**
 * Extrai índice 1-based a partir de fala: «2», «número dois», «a terceira», «opção 1».
 */
export function parseSpokenChoiceIndex(
  spoken: string,
  max: number
): number | null {
  const n = normalizeSpoken(spoken).trim();
  if (!n || max < 1) return null;

  // Dígitos: "2", "numero 2", "opcao 3", "a 1"
  const digit = n.match(/\b(?:numero|opcao|escolha)?\s*(\d{1,2})\b/);
  if (digit) {
    const idx = Number(digit[1]);
    if (idx >= 1 && idx <= max) return idx;
  }

  // Só um número na frase
  const onlyNum = n.match(/^(\d{1,2})$/);
  if (onlyNum) {
    const idx = Number(onlyNum[1]);
    if (idx >= 1 && idx <= max) return idx;
  }

  // Por extenso (ordenar por tamanho para «primeiro» antes de matches curtos)
  const words = Object.entries(SPOKEN_NUMBERS).sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [word, idx] of words) {
    if (idx > max) continue;
    const re = new RegExp(`\\b(?:numero|opcao|a|o)?\\s*${word}\\b`);
    if (re.test(n)) return idx;
  }

  return null;
}
