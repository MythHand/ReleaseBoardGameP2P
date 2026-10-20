import i18n from '@release/translation'
import { fireEvent, render, screen } from '@testing-library/react'
import { createModuleResource } from '../lib/moduleResource'
import DeferredContent from './DeferredContent'

it('offers explicit refresh for a browser-cached module fetch failure', async () => {
  await i18n.changeLanguage('en')
  const resource = createModuleResource(() =>
    Promise.reject(
      new TypeError('Failed to fetch dynamically imported module: http://localhost/chunk.js'),
    ),
  )
  render(
    <DeferredContent resource={resource}>{(value) => <div>{String(value)}</div>}</DeferredContent>,
  )
  expect(await screen.findByRole('button', { name: /Refresh page/ })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull()
})

it('recovers deferred content after a failed load without refreshing', async () => {
  await i18n.changeLanguage('en')
  let attempts = 0
  const resource = createModuleResource(async () => {
    await Promise.resolve()
    if (++attempts === 1) throw new TypeError('offline')
    return 'Content loaded'
  })
  render(<DeferredContent resource={resource}>{(value) => <div>{value}</div>}</DeferredContent>)
  fireEvent.click(await screen.findByRole('button', { name: /Try again/ }))
  expect(await screen.findByText('Content loaded')).toBeTruthy()
})
