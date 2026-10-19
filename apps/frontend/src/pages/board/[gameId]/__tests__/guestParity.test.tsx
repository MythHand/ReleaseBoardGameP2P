import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

it('lets the host close admission while existing spectators remain connected', () => {
  const props = makeBoardProps()
  const onSpectatorLimitChange = vi.fn()
  render(<Board {...props} room={{ ...props.room, spectatorLimit: 8, onSpectatorLimitChange }} />)
  fireEvent.click(screen.getByRole('button', { name: props.copy.table.settings }))
  const slider = screen.getByRole('slider') as HTMLInputElement
  expect(slider.min).toBe('0')
  fireEvent.change(slider, { target: { value: '0' } })
  expect(onSpectatorLimitChange).toHaveBeenCalledWith(0)
  fireEvent.click(screen.getByRole('button', { name: props.copy.table.tabParticipants }))
  expect(screen.getByText('oracle')).toBeTruthy()
})

it('lets a spectator disable local card parallax without a player action', () => {
  const props = makeBoardProps()
  const onParallaxChange = vi.fn()
  render(
    <Board
      {...props}
      state={{ ...props.state, you: null, selfId: null }}
      room={{ ...props.room, role: 'guest', parallax: true, onParallaxChange }}
      copy={{
        ...props.copy,
        table: {
          ...props.copy.table,
          parallax: 'card parallax',
          parallaxOn: 'On',
          parallaxOff: 'Off',
        },
      }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: props.copy.table.settings }))
  fireEvent.click(screen.getByRole('button', { name: 'On' }))
  expect(onParallaxChange).toHaveBeenCalledWith(false)
  expect(screen.queryByTestId('board-you')).toBeNull()
})

const withActionTime = (props: ReturnType<typeof makeBoardProps>) => ({
  ...props.copy,
  table: { ...props.copy.table, actionTime: 'action time', actionTimeHint: 'more time' },
})

it('lets the host give every action more time', () => {
  const props = makeBoardProps()
  const onActionTimeChange = vi.fn()
  render(
    <Board
      {...props}
      room={{ ...props.room, actionTime: 1, onActionTimeChange }}
      copy={withActionTime(props)}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: props.copy.table.settings }))
  fireEvent.click(screen.getByRole('button', { name: '2x' }))
  expect(onActionTimeChange).toHaveBeenCalledWith(2)
})

it('shows everyone else the host’s action time, and lets them change nothing', () => {
  const props = makeBoardProps()
  const onActionTimeChange = vi.fn()
  render(
    <Board
      {...props}
      room={{ ...props.room, role: 'guest', actionTime: 3, onActionTimeChange }}
      copy={withActionTime(props)}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: props.copy.table.settings }))
  expect(screen.getByText('action time')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '1x' }))
  expect(onActionTimeChange).not.toHaveBeenCalled()
})
