import i18n from '@release/translation'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useRulesResource } from './useRulesResource'

afterEach(() => vi.unstubAllGlobals())

it('does not fetch rules while closed and ignores an obsolete language completion', async () => {
  await i18n.changeLanguage('ru')
  let finishRussian: (value: Response) => void = () => {}
  let requests = 0
  vi.stubGlobal('fetch', (url: string) => {
    requests++
    if (url.includes('/ru/'))
      return new Promise<Response>((resolve) => {
        finishRussian = resolve
      })
    return Promise.resolve(
      new Response(JSON.stringify({ rules: {}, rulesBlock: { text: 'English' } })),
    )
  })
  const { result, rerender } = renderHook(({ enabled }) => useRulesResource(enabled), {
    initialProps: { enabled: false },
  })
  expect(result.current.status).toBe('idle')
  expect(requests).toBe(0)
  rerender({ enabled: true })
  await waitFor(() => expect(requests).toBe(2))
  await act(async () => {
    await i18n.changeLanguage('en')
  })
  await waitFor(() => expect(result.current.status).toBe('ready'))
  await act(async () => {
    finishRussian(new Response(JSON.stringify({ rules: {}, rulesBlock: { text: 'Русский' } })))
    await Promise.resolve()
  })
  expect(result.current.language).toBe('en')
  expect(result.current.status).toBe('ready')
})
