import { VoiceTabIcon } from '@release/ui'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

it.each([
  false,
  true,
])('shows player/spectator voice after settings, before chat, in a 420px drawer (spectator: %s)', (spectator) => {
  const props = makeBoardProps()
  const state = spectator ? { ...props.state, selfId: null, you: null } : props.state
  props.copy.table.tabVoice = 'Voice'
  render(
    <Board
      {...props}
      state={state}
      slots={{
        voice: <div>voice panel</div>,
        voiceTab: <VoiceTabIcon status="connected" micOff />,
        chat: <div>chat panel</div>,
      }}
    />,
  )
  const settings = screen.getByRole('button', { name: props.copy.table.settings })
  const voice = screen.getByRole('button', { name: 'Voice' })
  const chat = screen.getByRole('button', { name: props.copy.table.tabChat })
  expect(settings.compareDocumentPosition(voice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(voice.compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(voice)
  expect(
    (screen.getByText('voice panel').closest('[aria-hidden]') as HTMLElement).style.inlineSize,
  ).toBe('420px')
  fireEvent.click(chat)
  expect(screen.getByText('chat panel')).toBeTruthy()
})
