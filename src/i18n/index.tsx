import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getSecretinaLanguage,
  type SecretinaLanguage,
} from '@/services/secretinaLanguage';
import { createTranslator, type TranslateFn } from '@/i18n/types';
import { ptBR, type PtBRKey } from '@/i18n/locales/pt-BR';
import { es } from '@/i18n/locales/es';
import { en } from '@/i18n/locales/en';

export const catalogs: Record<SecretinaLanguage, Record<string, string>> = {
  'pt-BR': ptBR as unknown as Record<string, string>,
  es: es as unknown as Record<string, string>,
  en: en as unknown as Record<string, string>,
};

type I18nValue = {
  lang: SecretinaLanguage;
  t: TranslateFn;
  /** Actualiza a UI de imediato (pré-visualização ou após gravar). */
  setUiLanguage: (next: SecretinaLanguage) => void;
  refreshLanguage: () => Promise<SecretinaLanguage>;
};

const I18nContext = createContext<I18nValue>({
  lang: 'pt-BR',
  t: (key) => String(key),
  setUiLanguage: () => undefined,
  refreshLanguage: async () => 'pt-BR',
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<SecretinaLanguage>('pt-BR');

  const setUiLanguage = useCallback((next: SecretinaLanguage) => {
    setLang(next);
  }, []);

  const refreshLanguage = useCallback(async () => {
    const next = await getSecretinaLanguage();
    setLang(next);
    return next;
  }, []);

  useEffect(() => {
    void refreshLanguage();
  }, [refreshLanguage]);

  const t = useMemo(() => {
    const catalog = catalogs[lang] ?? catalogs['pt-BR'];
    return createTranslator(catalog, catalogs['pt-BR']);
  }, [lang]);

  const value = useMemo(
    () => ({ lang, t, setUiLanguage, refreshLanguage }),
    [lang, t, setUiLanguage, refreshLanguage]
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

export type { PtBRKey, TranslateFn, SecretinaLanguage };
