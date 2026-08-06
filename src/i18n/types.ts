import type { PtBRKey } from '@/i18n/locales/pt-BR';

export type TranslationKey = PtBRKey;

export type TranslateFn = (
  key: TranslationKey,
  params?: Record<string, string | number>
) => string;

export type Messages = Record<string, string>;

export function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    params[k] != null ? String(params[k]) : `{${k}}`
  );
}

export function createTranslator(
  catalog: Messages,
  fallback: Messages
): TranslateFn {
  return (key, params) => {
    const raw = catalog[key] ?? fallback[key] ?? String(key);
    return interpolate(raw, params);
  };
}
