import { act, renderHook } from '@testing-library/react'
import { usePresentationAck } from './usePresentationAck'

it('reports only the committed settled revision, once, and ignores superseded work', () => {
  const reports: number[] = []
  const onReady = (id: { revision: number }) => reports.push(id.revision)
  const initial = {
    presentation: { gameId: 'g', incarnation: 'i', revision: 1 },
    settled: false,
    onReady,
  }
  const { rerender } = renderHook((props) => usePresentationAck(props), { initialProps: initial })
  expect(reports).toEqual([])
  act(() => rerender({ ...initial, presentation: { ...initial.presentation, revision: 2 } }))
  expect(reports).toEqual([])
  act(() =>
    rerender({ ...initial, presentation: { ...initial.presentation, revision: 2 }, settled: true }),
  )
  expect(reports).toEqual([2])
  act(() =>
    rerender({ ...initial, presentation: { ...initial.presentation, revision: 2 }, settled: true }),
  )
  expect(reports).toEqual([2])
  act(() =>
    rerender({
      ...initial,
      presentation: { gameId: 'new', incarnation: 'i', revision: 1 },
      settled: true,
    }),
  )
  expect(reports).toEqual([2, 1])
})
