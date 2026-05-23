import { COUNTRY_DIAL_CODES, DEFAULT_DIAL_CODE } from '@/utils/countryCodes';

/** Monta número normalizado: DDI + só dígitos locais (sem +). */
export function buildPhoneNormalized(
  dialCode: string,
  localNumber: string
): string {
  const code = dialCode.replace(/\D/g, '');
  const local = localNumber.replace(/\D/g, '');
  if (!code || !local) return '';
  return `${code}${local}`;
}

/** Separa número salvo em prefixo + restante (tenta DDI conhecidos). */
export function splitPhoneNormalized(normalized: string): {
  dialCode: string;
  local: string;
} {
  const d = normalized.replace(/\D/g, '');
  if (!d) return { dialCode: DEFAULT_DIAL_CODE, local: '' };

  const sorted = [...COUNTRY_DIAL_CODES].sort(
    (a, b) => b.code.length - a.code.length
  );
  for (const c of sorted) {
    if (d.startsWith(c.code) && d.length > c.code.length + 6) {
      return { dialCode: c.code, local: d.slice(c.code.length) };
    }
  }
  if (d.length <= 11 && !d.startsWith('55')) {
    return { dialCode: DEFAULT_DIAL_CODE, local: d };
  }
  return { dialCode: d.slice(0, 2), local: d.slice(2) };
}

/** Importação do celular: só dígitos, sem acrescentar +55. */
export function normalizePhoneFromDevice(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Cadastro manual com DDI escolhido no seletor — não use na importação. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length <= 11 && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
}

export function formatPhoneDisplay(normalized: string): string {
  const d = normalized.replace(/\D/g, '');
  if (d.length < 10) return normalized ? `+${d}` : '';
  const { dialCode, local } = splitPhoneNormalized(d);
  if (dialCode === '55' && local.length === 11) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (dialCode === '55' && local.length === 10) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  if (dialCode === '1' && local.length === 10) {
    return `+1 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return `+${dialCode} ${local}`;
}
