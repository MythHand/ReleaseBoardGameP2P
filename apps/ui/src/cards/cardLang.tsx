import { createContext, useContext } from 'react'

// Language for the composed card faces (CARD_CONTENT is localized). @release/ui
// stays i18n-agnostic elsewhere, but a composed face needs its localized copy —
// so a consumer wraps its card-bearing subtree in <CardLangProvider value=…>.
// CardFace reads it; defaults to 'ru' so a card never crashes without a provider.
export type CardLang = 'ru' | 'en'

const CardLangContext = createContext<CardLang>('ru')

export const CardLangProvider = CardLangContext.Provider
export const useCardLang = () => useContext(CardLangContext)
