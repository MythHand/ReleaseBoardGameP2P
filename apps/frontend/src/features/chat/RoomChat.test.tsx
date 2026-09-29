import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import type { UseLobby } from '~/network'
import { RoomChat, useRoomChatView } from './RoomChat'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}))

let session: UseLobby
vi.mock('~/app/providers/SessionProvider', () => ({ useSession: () => session }))

// The route owns useRoomChatView while Board can replace its Chat slot on tab
// visibility. The hook must preserve a draft across that child-only remount.
function Page() {
  const view = useRoomChatView()
  const [show, setShow] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setShow((value) => !value)}>
        toggle chat slot
      </button>
      {show && <RoomChat view={view} />}
    </>
  )
}

it('keeps an unsent draft across a chat slot remount and clears it only after a successful send', () => {
  const send = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
  session = {
    state: null,
    chat: { entries: [], notificationEntryIds: [], selfMemberId: 'me', send },
  } as unknown as UseLobby
  render(<Page />)

  fireEvent.change(screen.getByPlaceholderText('chat.placeholder'), {
    target: { value: 'unsent message' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'toggle chat slot' }))
  fireEvent.click(screen.getByRole('button', { name: 'toggle chat slot' }))
  const field = screen.getByPlaceholderText('chat.placeholder') as HTMLTextAreaElement
  expect(field.value).toBe('unsent message')

  fireEvent.keyDown(field, { key: 'Enter' })
  expect(send).toHaveBeenCalledWith('unsent message')
  expect(field.value).toBe('unsent message')

  fireEvent.keyDown(field, { key: 'Enter' })
  expect(send).toHaveBeenCalledTimes(2)
  expect(field.value).toBe('')
})
