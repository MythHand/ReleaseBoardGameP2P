import { createContext, useContext } from 'react'

// Язык предпросмотра в плейграунде. Стори читают его через useLang()
// и сами выбирают нужный набор copy (RU/EN) — UI остаётся i18n-агностичным.
export type Lang = 'ru' | 'en'

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
}

export const LangContext = createContext<LangCtx>({ lang: 'ru', setLang: () => {} })

export const useLang = () => useContext(LangContext)

// Удобный выбор варианта по текущему языку: pick(lang, { ru, en }).
export function pick<T>(lang: Lang, variants: Record<Lang, T>): T {
  return variants[lang]
}
