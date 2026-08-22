import { describe, expect, it } from 'vitest'
import { CENTRE_SETS, CENTRE_SLOTS, type CentreSlot, centreTransform } from './centre'

// The rules of the centre that a stylesheet cannot be asked about. Every one of
// these used to live only in a CSS module, where jsdom does not load it and no
// test can reach it — which is how the same geometry ended up written twice and
// staying equal by attention alone.
describe('the centre of the table', () => {
  it('lays the cover exactly over what it covers, and above it', () => {
    // The whole point of the cover: same place, higher layer. Equal `dx` is what
    // makes it land ON the attack rather than beside it; the z is what makes it
    // read as covering rather than being covered.
    expect(CENTRE_SLOTS.cover.dx).toBe(CENTRE_SLOTS.centre.dx)
    expect(CENTRE_SLOTS.cover.z).toBeGreaterThan(CENTRE_SLOTS.centre.z)
  })

  it('keeps the waiting sudo out from under the attack', () => {
    // It is not part of the pair yet, so it stands beside the attack — and below
    // it, because anything the attack's own answer does must read over it.
    expect(CENTRE_SLOTS.sudo.dx).toBeLessThan(CENTRE_SLOTS.centre.dx)
    expect(CENTRE_SLOTS.sudo.z).toBeLessThan(CENTRE_SLOTS.centre.z)
  })

  it('puts the release and its price on opposite sides of the centre', () => {
    // The price is shown to the table beside the release it pays for, so the two
    // are a pair the eye reads at once — and symmetric, or the row would drift
    // off the middle of the table.
    expect(CENTRE_SLOTS.stage.dx).toBeLessThan(0)
    expect(CENTRE_SLOTS.cost.dx).toBe(-CENTRE_SLOTS.stage.dx)
  })

  it('gives every situation only slots that exist', () => {
    // A set is a game situation written down. A typo in one would silently draw
    // nothing at all rather than fail.
    const known = new Set(Object.keys(CENTRE_SLOTS))
    for (const [name, slots] of Object.entries(CENTRE_SETS)) {
      for (const slot of slots) expect(known.has(slot), `${name} → ${slot}`).toBe(true)
    }
  })

  it('centres a slot with no offset and shifts the rest by their own dx', () => {
    expect(centreTransform('centre')).toBe('translate(-50%, -50%)')
    expect(centreTransform('cost')).toBe('translate(calc(-50% + 92px), -50%)')
    // negative offsets keep their sign inside the calc rather than becoming a
    // subtraction the string has to spell differently
    expect(centreTransform('stage')).toBe('translate(calc(-50% + -92px), -50%)')
  })

  it('names no two slots the same place at the same layer', () => {
    // Two slots sharing both dx and z would be one slot with two names — and the
    // second one would be invisible, sitting exactly under the first.
    const seen = new Set<string>()
    for (const slot of Object.keys(CENTRE_SLOTS) as CentreSlot[]) {
      const { dx, z } = CENTRE_SLOTS[slot]
      const key = `${dx}:${z}`
      expect(seen.has(key), `${slot} shares a place with another slot`).toBe(false)
      seen.add(key)
    }
  })
})
