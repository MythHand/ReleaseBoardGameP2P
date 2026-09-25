import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import MoveHistory from './MoveHistory'

const copy = { draw: 'draw', eliminated: 'is out' }

// The badge used to key off `kind === 'добор'` — a Russian literal from the
// mock era, which a translated `kind` can never match. The kit is
// i18n-agnostic, so the flag is the contract.
it('badges a row the caller marked as a draw, whatever its kind reads', () => {
  const { getByText } = render(
    <MoveHistory
      copy={copy}
      entries={[{ id: 1, who: 'you', kind: 'Draw', card: 'Bug', draw: true }]}
    />,
  )
  expect(getByText('draw')).toBeTruthy()
})

// C1 (Critical, whole-branch review #136): `Row` used to return straight out
// of its system branch, before it ever reached `e.children?.map(...)` — so
// everything the engine parents to an `eliminated` (or any other system) row,
// a hand and a zone worth of `discarded` cards, rendered nowhere at all. The
// grey system line is correct; swallowing its children is not.
it("renders a system row's children instead of swallowing them", () => {
  const { getByText } = render(
    <MoveHistory
      copy={copy}
      entries={[
        {
          id: 1,
          who: 'Bob',
          system: true,
          children: [
            { id: 2, who: 'Bob', card: 'Bug', kind: 'discard' },
            { id: 3, who: 'Bob', card: 'DDoS', kind: 'discard' },
          ],
        },
      ]}
    />,
  )
  expect(getByText('Bob is out')).toBeTruthy()
  expect(getByText('Bug')).toBeTruthy()
  expect(getByText('DDoS')).toBeTruthy()
})

// Newest first at the top level; a reaction stays under the entry it answers,
// in the order it happened.
it('lists the newest entry first and keeps children under their parent', () => {
  const { container } = render(
    <MoveHistory
      copy={copy}
      entries={[
        {
          id: 1,
          who: 'Ann',
          kind: 'attack',
          card: 'Bug',
          children: [
            { id: 2, who: 'Bo', kind: 'defend', card: 'Hotfix' },
            { id: 3, who: 'Ann', kind: 'counter', card: 'Sudo' },
          ],
        },
        { id: 4, who: 'Bo', kind: 'Draw', card: 'DDoS' },
      ]}
    />,
  )
  const order = [...container.querySelectorAll('[data-accented]')].map(
    (row) => row.querySelector('span')?.textContent,
  )
  expect(order).toEqual(['DDoS', 'Bug', 'Hotfix', 'Sudo'])
})
