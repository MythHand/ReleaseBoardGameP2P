import { fireEvent, render, screen } from '@testing-library/react'
import i18n from '@release/translation'
import { createModuleResource } from '../lib/moduleResource'
import DeferredContent from './DeferredContent'

it('recovers deferred content after a failed load without refreshing', async () => {
  await i18n.changeLanguage('en')
  let attempts = 0
  const resource = createModuleResource(async () => {
    if (++attempts === 1) throw new TypeError('offline')
    return 'Content loaded'
  })
  render(<DeferredContent resource={resource}>{(value) => <div>{value}</div>}</DeferredContent>)
  fireEvent.click(await screen.findByRole('button', { name: /Try again/ }))
  expect(await screen.findByText('Content loaded')).toBeTruthy()
})
