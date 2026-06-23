/// <reference path="./i18next.d.ts" />
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import enCommon from './locales/en/common.json'
import ruCommon from './locales/ru/common.json'

export const resources = {
  en: { common: enCommon },
  ru: { common: ruCommon },
} as const

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'ru'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  })

export default i18n
