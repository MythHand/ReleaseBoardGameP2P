import i18n from '@release/translation'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import copy from '../../../../../packages/translation/src/locales/en/rules.json'
import Rules from './Rules'

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
})

it('keeps the loaded board rules and search when the retained panel is reopened', async () => {
  await i18n.changeLanguage('en')
  // jsdom has no layout or scrolling API.
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  const fetcher = vi.fn(async () => new Response(JSON.stringify(copy)))
  vi.stubGlobal('fetch', fetcher)
  const { rerender } = render(<Rules enabled={false} />)
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(fetcher).not.toHaveBeenCalled()

  rerender(<Rules enabled />)
  const placeholder = i18n.t('rulesBlock.searchPlaceholder')
  const search = await screen.findByPlaceholderText(placeholder)
  fireEvent.change(search, { target: { value: 'Debugger' } })
  rerender(<Rules enabled={false} />)
  expect((search as HTMLInputElement).value).toBe('Debugger')

  await act(() => {
    rerender(<Rules enabled />)
  })
  await waitFor(() => {
    expect(screen.getByPlaceholderText(placeholder)).toBe(search)
    expect((search as HTMLInputElement).value).toBe('Debugger')
  })
  expect(fetcher).toHaveBeenCalledTimes(1)
})
