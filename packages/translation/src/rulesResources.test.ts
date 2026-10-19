import { createInstance } from 'i18next'
import { expect, it } from 'vitest'
import en from './locales/en/common.json'
import ru from './locales/ru/common.json'
import { createRulesLoader } from './rulesResources'

it('shares language loads, merges common fields, and retains English fallback', async () => {
  const instance = createInstance()
  await instance.init({
    resources: { en: { common: en }, ru: { common: ru } },
    lng: 'ru',
    fallbackLng: 'en',
    defaultNS: 'common',
  })
  const requests: string[] = []
  const load = createRulesLoader(instance, async (url) => {
    await Promise.resolve()
    requests.push(String(url))
    const english = String(url).includes('/en/')
    return new Response(
      JSON.stringify({
        rules: { meta: 'meta' },
        rulesBlock: english
          ? { text: 'English rules', meta: 'English metadata' }
          : { text: 'Русские правила' },
      }),
    )
  })
  await Promise.all([load('ru-RU'), load('ru')])
  expect(requests).toHaveLength(2)
  expect(instance.getResource('ru', 'common', 'rulesBlock.text')).toBe('Русские правила')
  expect(instance.t('rulesBlock.meta', { returnObjects: true })).toBe('English metadata')
  expect(instance.t('rulesBlock.searchPlaceholder')).toBe(ru.rulesBlock.searchPlaceholder)
})

it('retries a failed resource instead of retaining a rejected promise', async () => {
  const instance = createInstance()
  await instance.init({ lng: 'en' })
  let attempts = 0
  const load = createRulesLoader(instance, async () => {
    await Promise.resolve()
    if (++attempts === 1) throw new TypeError('offline')
    return new Response(JSON.stringify({ rules: { meta: 'meta' }, rulesBlock: { text: 'rules' } }))
  })
  await expect(load('en')).rejects.toThrow('offline')
  await load('en')
  expect(instance.getResource('en', 'common', 'rulesBlock.text')).toBe('rules')
})
