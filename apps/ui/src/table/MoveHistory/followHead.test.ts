import { expect, it } from 'vitest'
import { atHead, FOLLOW_SLACK } from './followHead'

const el = (scrollTop: number) => ({ scrollTop }) as HTMLElement

it('reads a reader at the top as at the head', () => {
  expect(atHead(el(0))).toBe(true)
})

it('treats a near-miss within the slack as the head', () => {
  expect(atHead(el(FOLLOW_SLACK - 1))).toBe(true)
})

// A reader who has scrolled down is reading older rows. A panel that yanks
// itself away from them is worse than one that does not follow at all.
it('reads a reader who has scrolled down as reading', () => {
  expect(atHead(el(FOLLOW_SLACK))).toBe(false)
})
