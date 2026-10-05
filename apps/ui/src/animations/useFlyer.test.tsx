import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useFlyer } from './useFlyer'

// TWO STEPS' CARRIERS IN ONE LIST. The board renders several steps' carriers
// side by side — the gesture's own (its stage flyer, its cost flyer, the pair's
// node) and every beat's — and each step counts its flights from one. Keyed by
// that count alone, the first carrier of one step and the first of another were
// the same child to React, which matched them up: a Code Review pair standing
// at the centre was rebuilt invisible for as long as the cost card flew (#168).
const steps: { a?: ReturnType<typeof useFlyer>; b?: ReturnType<typeof useFlyer> } = {}
function Probe() {
  steps.a = useFlyer()
  steps.b = useFlyer()
  return <>{[...steps.a.overlay, ...steps.b.overlay]}</>
}

it('keeps the first carriers of two steps apart when they share one list', () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { container } = render(<Probe />)
  const at = { left: 0, top: 0, width: 150, height: 210 }
  act(() => {
    void steps.a?.raise([{ key: 'mine', at, content: <i data-step="a" /> }])
    void steps.b?.raise([{ key: 'mine', at, content: <i data-step="b" /> }])
  })
  expect(container.querySelector('[data-step="a"]')).not.toBeNull()
  expect(container.querySelector('[data-step="b"]')).not.toBeNull()
  expect(errors.mock.calls.some((call) => String(call[0]).includes('same key'))).toBe(false)
  errors.mockRestore()
})
