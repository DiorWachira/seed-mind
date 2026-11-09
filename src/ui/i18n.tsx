/**
 * Tiny i18n. English strings are the keys: t('New game') returns the Kiswahili text when the
 * language is 'sw' and a translation exists, otherwise the English. Placeholders: {name}.
 * The Kiswahili dictionary is a draft for review by a native speaker (see roadmap.txt).
 * Coach explanations come from the engine and stay in English for now.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SW } from '../i18n/sw';
import { store, type Lang } from './storage';

type Vars = Record<string, string | number>;
export type T = (s: string, vars?: Vars) => string;

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : s);

export function translate(lang: Lang, s: string, vars?: Vars): string {
  return fill(lang === 'sw' ? SW[s] ?? s : s, vars);
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: T }>({
  lang: 'en',
  setLang: () => {},
  t: (s, v) => fill(s, v),
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(store.lang());
  const setLang = useCallback((l: Lang) => { setLangState(l); store.setLang(l); }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const t = useCallback<T>((s, v) => translate(lang, s, v), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
export const useT = (): T => useContext(Ctx).t;
