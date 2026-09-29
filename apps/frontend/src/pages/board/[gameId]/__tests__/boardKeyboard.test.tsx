import { Chat, cardById } from '@release/ui'
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import Board from '../_Board'
import { useBoardKeyboard } from '../_useBoardKeyboard'
import { introFixture, makeBoardProps } from './fixture'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('gives each Escape to panel, defense, staged play, then opening', () => {
  const actions = {
    panel: { active: true, run: vi.fn() },
    defense: { active: true, run: vi.fn() },
    staged: { active: true, run: vi.fn() },
    opening: { active: true, run: vi.fn() },
  }
  const { rerender } = renderHook(useBoardKeyboard, { initialProps: actions })
  const ordered = Object.keys(actions) as (keyof typeof actions)[]
  for (const [index, key] of ordered.entries()) {
    fireEvent.keyDown(window, { key: 'Escape' })
    for (const [otherIndex, other] of ordered.entries()) {
      expect(actions[other].run).toHaveBeenCalledTimes(otherIndex <= index ? 1 : 0)
    }
    actions[key] = { ...actions[key], active: false }
    rerender({ ...actions })
  }
})

it('consumes an active cancellation even if its internal animation guard declines', () => {
  const skip = vi.fn()
  renderHook(() =>
    useBoardKeyboard({
      panel: { active: false, run: () => {} },
      defense: { active: false, run: () => {} },
      staged: { active: true, run: () => {} },
      opening: { active: true, run: skip },
    }),
  )
  expect(fireEvent.keyDown(window, { key: 'Escape' })).toBe(false)
  expect(skip).not.toHaveBeenCalled()
})

function handCard(id: string) {
  const card = cardById(id)
  if (!card) throw new Error(`Missing card ${id}`)
  return { uid: `${id}#0`, card }
}
function attackProps() {
  const base = makeBoardProps()
  return makeBoardProps({
    state: {
      ...base.state,
      you: { ...base.state.you, hand: [handCard('attack-bug'), handCard('release-frontend')] },
      turn: base.state.selfId,
      hasDrawn: true,
      playable: ['attack-bug#0'],
      targets: { 'attack-bug#0': [{ kind: 'player', player: 'p2' }] },
    },
    actions: { onPlay: vi.fn() },
  })
}
async function pull(uid: string) {
  const slot = document.querySelector(`[data-hand-slot="${uid}"]`)
  if (!slot) throw new Error(`Missing slot ${uid}`)
  fireEvent.mouseDown(slot, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
  fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 600))
  })
}
const inFan = (uid: string) => document.querySelector(`[data-hand-slot="${uid}"]`)

it('closes the Board drawer before returning a staged attack', async () => {
  const props = attackProps()
  render(<Board {...props} />)
  fireEvent.click(screen.getByRole('button', { name: props.copy.table.tabHistory }))
  const drawer = screen.getByTestId('panel-history').closest('[aria-hidden]')
  await pull('attack-bug#0')
  expect(screen.getByTestId('board-centre-staged')).toBeTruthy()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(drawer?.getAttribute('aria-hidden')).toBe('true')
  expect(screen.getByTestId('board-centre-staged')).toBeTruthy()
  expect(inFan('attack-bug#0')).toBeNull()
  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() => expect(inFan('attack-bug#0')).toBeTruthy())
  expect(screen.queryByTestId('board-centre-staged')).toBeNull()
  expect(props.actions?.onPlay).not.toHaveBeenCalled()
})

it('reports a controlled panel close from chat focus, preserving the staged card and draft', async () => {
  const props = attackProps()
  const onPanelChange = vi.fn()
  const chat = <Chat messages={[]} copy={{ placeholder: 'Draft', send: 'Send', empty: 'Empty' }} />
  const { rerender } = render(
    <Board {...props} panel="chat" onPanelChange={onPanelChange} slots={{ chat }} />,
  )
  await pull('attack-bug#0')
  const field = screen.getByPlaceholderText('Draft')
  fireEvent.change(field, { target: { value: 'two words' } })
  field.focus()
  fireEvent.keyDown(field, { key: 'Escape' })
  expect(onPanelChange).toHaveBeenCalledExactlyOnceWith(null)
  expect((field as HTMLTextAreaElement).value).toBe('two words')
  expect(screen.getByTestId('board-centre-staged')).toBeTruthy()
  rerender(<Board {...props} panel={null} onPanelChange={onPanelChange} slots={{ chat }} />)
  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() => expect(inFan('attack-bug#0')).toBeTruthy())
})

it('does not return an attack after it has dispatched', async () => {
  const props = attackProps()
  render(<Board {...props} />)
  await pull('attack-bug#0')
  fireEvent.click(screen.getByTestId('seat-p2'))
  expect(props.actions?.onPlay).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(window, { key: 'Escape' })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 600))
  })
  expect(inFan('attack-bug#0')).toBeNull()
  expect(screen.getByTestId('board-centre-staged')).toBeTruthy()
})

it.each([
  'support-sudo',
  'defense-hotfix',
])('respects defense cancellation and dispatch for %s', async (id) => {
  const base = makeBoardProps()
  const onResolve = vi.fn()
  const props = makeBoardProps({
    state: {
      ...base.state,
      you: { ...base.state.you, hand: [handCard('support-sudo'), handCard('defense-hotfix')] },
      playable: [],
      comboOptions: { 'support-sudo#0': ['defense-hotfix#0'] },
      pending: {
        kind: 'defend',
        player: base.state.selfId,
        attacker: 'p2',
        attackCard: 'attack-bug',
        sudo: false,
        options: ['defense-hotfix#0'],
        openedAt: 0,
        deadline: 15000,
        scope: 'release',
      },
    },
    actions: { onResolve },
  })
  render(<Board {...props} />)
  await pull(`${id}#0`)
  expect(inFan(`${id}#0`)).toBeNull()
  fireEvent.keyDown(window, { key: 'Escape' })
  if (id === 'support-sudo') {
    await waitFor(() => expect(inFan(`${id}#0`)).toBeTruthy())
    expect(onResolve).not.toHaveBeenCalled()
  } else {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600))
    })
    expect(inFan(`${id}#0`)).toBeNull()
    expect(onResolve).toHaveBeenCalledTimes(1)
  }
})

it('skips an opening with Escape when no higher action is active', () => {
  const onDone = vi.fn()
  const { container } = render(
    <Board {...makeBoardProps()} intro={{ ...introFixture(), onDone }} />,
  )
  expect(container.querySelector('[class*="railLayer"]')?.hasAttribute('inert')).toBe(true)
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(onDone).toHaveBeenCalledTimes(1)
  expect(container.querySelector('[class*="railLayer"]')?.hasAttribute('inert')).toBe(false)
})
