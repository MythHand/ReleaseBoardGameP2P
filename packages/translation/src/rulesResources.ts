import i18n, { type i18n as I18n } from 'i18next'
import enUrl from './locales/en/rules.json?url'
import ruUrl from './locales/ru/rules.json?url'

const urls = { en: enUrl, ru: ruUrl }

export function createRulesLoader(
  instance: I18n,
  fetcher: typeof fetch = (...args) => fetch(...args),
) {
  const pending = new Map<string, Promise<void>>()
  const load = (lang: 'en' | 'ru'): Promise<void> => {
    const existing = pending.get(lang)
    if (existing) return existing
    const request = (async () => {
      const response = await fetcher(urls[lang])
      if (!response.ok) throw new Error(`Rules resource: HTTP ${response.status}`)
      const data: unknown = await response.json()
      if (!data || typeof data !== 'object' || !('rules' in data) || !('rulesBlock' in data)) {
        throw new Error('Invalid rules resource')
      }
      instance.addResourceBundle(lang, 'common', data, true, true)
    })().catch((error: unknown) => {
      pending.delete(lang)
      throw error
    })
    pending.set(lang, request)
    return request
  }
  return async (language: string): Promise<void> => {
    const lang = language.toLowerCase().split('-')[0] === 'ru' ? 'ru' : 'en'
    await Promise.all(lang === 'en' ? [load('en')] : [load('ru'), load('en')])
  }
}

export const loadRules = createRulesLoader(i18n)
