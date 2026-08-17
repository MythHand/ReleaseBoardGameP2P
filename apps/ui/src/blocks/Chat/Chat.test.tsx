import { fireEvent, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Chat, { type ChatCopy } from './Chat'

const copy: ChatCopy = { placeholder: 'сообщение', send: 'отправить', empty: 'пока тихо' }

// Enter отправляет, Shift+Enter переносит строку — и перенос обязан доехать до
// отправленного текста целиком, а не одной первой строкой.
it('sends every line of a multi-line draft, not just the first', () => {
  const onSend = vi.fn()
  const { getByPlaceholderText } = render(<Chat messages={[]} copy={copy} onSend={onSend} />)
  const field = getByPlaceholderText(copy.placeholder)

  fireEvent.keyDown(field, { key: 'Enter', shiftKey: true })
  fireEvent.change(field, { target: { value: 'первая\nвторая' } })
  fireEvent.keyDown(field, { key: 'Enter' })

  expect(onSend).toHaveBeenCalledWith('первая\nвторая')
})

// Перенос доезжает и до разметки. Видимым его делает `white-space: pre-wrap` в
// module.css — саму отрисовку тут не проверить (jsdom модульный CSS не грузит),
// но текст с переносом обязан дойти до узла неискажённым.
it('keeps the line break in a rendered message', () => {
  const { getByText } = render(
    <Chat
      messages={[{ id: '1', who: 'deadlock', text: 'первая\nвторая', time: '20:00' }]}
      copy={copy}
    />,
  )
  expect(getByText(/первая/).textContent).toBe('первая\nвторая')
})
