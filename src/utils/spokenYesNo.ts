import { normalizeSpoken } from '@/utils/normalizeSpoken';

/** Respostas afirmativas curtas (pt-BR/pt-PT). */
export function isSpokenYes(spoken: string): boolean {
  const n = normalizeSpoken(spoken);
  if (!n) return false;
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
export function isSpokenNo(spoken: string): boolean {
  const n = normalizeSpoken(spoken);
  if (!n) return false;
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
