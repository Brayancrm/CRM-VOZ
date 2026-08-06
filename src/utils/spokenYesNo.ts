import { normalizeSpoken } from '@/utils/normalizeSpoken';
import type { SecretinaLanguage } from '@/services/secretinaLanguage';

/** Respostas afirmativas curtas. */
export function isSpokenYes(
  spoken: string,
  lang: SecretinaLanguage = 'pt-BR'
): boolean {
  const n = normalizeSpoken(spoken);
  if (!n) return false;

  if (lang === 'en') {
    if (
      /^(yes|yeah|yep|yup|sure|ok|okay|please|affirmative|correct|right)$/.test(
        n
      )
    ) {
      return true;
    }
    if (/^(yes|sure|ok)\b/.test(n) && n.length <= 24) return true;
    return false;
  }

  if (lang === 'es') {
    if (
      /^(si|sí|claro|puede|quiero|afirmativo|vale|ok|okay|por favor)$/.test(n)
    ) {
      return true;
    }
    if (/^(si|sí|claro|quiero|puede)\b/.test(n) && n.length <= 24) return true;
    return false;
  }

  if (
    /^(sim|si|yes|yep|yeah|claro|pode|quero|afirmativo|isso|isso mesmo|ok|okay|certo|com certeza|por favor|faz|faça|faz favor)$/.test(
      n
    )
  ) {
    return true;
  }
  if (/^(sim|quero|pode|claro)\b/.test(n) && n.length <= 24) return true;
  if (/\b(sim|quero|pode ser|pode sim)\b/.test(n) && n.length <= 40) {
    return true;
  }
  return false;
}

/** Respostas negativas curtas. */
export function isSpokenNo(
  spoken: string,
  lang: SecretinaLanguage = 'pt-BR'
): boolean {
  const n = normalizeSpoken(spoken);
  if (!n) return false;

  if (lang === 'en') {
    if (/^(no|nope|nah|negative|cancel)$/.test(n)) return true;
    if (/^no\b/.test(n) && n.length <= 28) return true;
    return false;
  }

  if (lang === 'es') {
    if (/^(no|nop|negativo)$/.test(n)) return true;
    if (/^no\b/.test(n) && n.length <= 28) return true;
    return false;
  }

  if (
    /^(nao|não|no|nope|negativo|agora nao|agora não|dispenso|obrigado|obrigada)$/.test(
      n
    )
  ) {
    return true;
  }
  if (/^(nao|não)\b/.test(n) && n.length <= 28) return true;
  if (/\b(nao|não) (quero|precisa|obrigado|obrigada)?\b/.test(n) && n.length <= 40) {
    return true;
  }
  return false;
}
