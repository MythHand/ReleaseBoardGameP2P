import { describe, expect, it } from 'vitest'
import {
  CENTRE_SETS,
  CENTRE_SLOTS,
  type CentrePlace,
  type CentreSlot,
  centreTransform,
} from './centre'

// The rules of the centre that a stylesheet cannot be asked about. Every one of
// these used to live only in a CSS module, where jsdom does not load it and no
// test can reach it — which is how the same geometry ended up written twice and
// staying equal by attention alone.
describe('the centre of the table', () => {
  it('lays the cover exactly over what it covers, and above it', () => {
    // The whole point of the cover: same place, higher layer. Equal `dx` is what
    // makes it land ON the attack rather than beside it; the layer is what makes
    // it read as covering rather than being covered — and the layer is the
    // SITUATION's, because it exists only where places overlap.
    expect(CENTRE_SLOTS.cover.dx).toBe(CENTRE_SLOTS.centre.dx)
    const { cover, centre } = CENTRE_SETS.defence
    expect(cover.z).toBeGreaterThan(centre.z)
  })

  it('keeps the waiting sudo out from under the attack', () => {
    // It is not part of the pair yet, so it stands beside the attack — and below
    // it, because anything the attack's own answer does must read over it.
    expect(CENTRE_SLOTS.sudo.dx).toBeLessThan(CENTRE_SLOTS.centre.dx)
    expect(CENTRE_SETS.defence.sudo.z).toBeLessThan(CENTRE_SETS.defence.centre.z)
  })

  it('claims a layer only where the situation has places on top of each other', () => {
    // Not decoration: a z-index makes a stacking context, and putting one on a
    // place a scene never layered changes how everything above it interleaves.
    // The defence stacks three places, so all three carry one; a reveal is one
    // place alone and carries none.
    const layerOf = (place: CentrePlace) => place.z
    expect(layerOf(CENTRE_SETS.reveal.centre)).toBeUndefined()
    for (const place of Object.values(CENTRE_SETS.release)) expect(layerOf(place)).toBeUndefined()
    expect(layerOf(CENTRE_SETS.ai.cause)).toBeUndefined()
    expect(layerOf(CENTRE_SETS.ai.effect)).toBe(1)
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
      for (const slot of Object.keys(slots)) expect(known.has(slot), `${name} → ${slot}`).toBe(true)
    }
  })

  it('says WHETHER a card lies square, and never at what angle', () => {
    // The boundary the module is not allowed to cross. Tilts are the scene's and
    // the beat's, and they are deliberately not uniform: the discard heap gives
    // every card its own angle from `scatterAt`, random-looking but
    // deterministic by key, so a heap looks the same on every peer and a card
    // lands exactly where it then rests. An angle declared here would collapse
    // that into one tilt for everyone — and drop a card that already computed
    // its own into a different one on its last frame.
    for (const geom of Object.values(CENTRE_SLOTS)) {
      expect(Object.keys(geom).sort()).toEqual(['dx', 'from', 'w'])
    }
    for (const set of Object.values(CENTRE_SETS)) {
      for (const place of Object.values(set)) {
        expect(['square', 'own']).toContain(place.tilt)
        expect(Object.keys(place).sort().join()).toMatch(/^(tilt|tilt,z|z,tilt)$/)
      }
    }
  })

  it('reads the same place differently by situation, which is I11', () => {
    // A trigger revealed into the centre lies square; an attack thrown into the
    // very same centre lies at its own angle. That is why the character belongs
    // to the set rather than to the place.
    expect(CENTRE_SETS.reveal.centre.tilt).toBe('square')
    expect(CENTRE_SETS.defence.centre.tilt).toBe('own')
    // Nothing the system deals is tilted…
    for (const place of Object.values(CENTRE_SETS.ai)) expect(place.tilt).toBe('square')
    // …and neither is a release that has not been played yet: it stands waiting
    // for its price, which is not a move being made. The rules owner's wording
    // of I11 — the tilt marks a card that has been PLAYED, not one that came
    // from a hand.
    expect(CENTRE_SETS.release.stage.tilt).toBe('square')
    expect(CENTRE_SETS.release.cost.tilt).toBe('square')
  })

  it('centres a slot with no offset and shifts the rest by their own dx', () => {
    expect(centreTransform('centre')).toBe('translate(-50%, -50%)')
    expect(centreTransform('cost')).toBe('translate(calc(-50% + 92px), -50%)')
    // negative offsets keep their sign inside the calc rather than becoming a
    // subtraction the string has to spell differently
    expect(centreTransform('stage')).toBe('translate(calc(-50% + -92px), -50%)')
  })

  it('gives every slot a width, and the AI effect the wider one it is drawn at', () => {
    // Width is per slot, not one number for the centre: the AI effect is the
    // card the table is reading at that moment and is drawn larger than the
    // trigger beside it. A single shared width silently shrank it.
    for (const slot of Object.keys(CENTRE_SLOTS) as CentreSlot[]) {
      expect(CENTRE_SLOTS[slot].w, slot).toBeGreaterThan(0)
    }
    expect(CENTRE_SLOTS.effect.w).toBeGreaterThan(CENTRE_SLOTS.cause.w)
  })

  it('says for every slot which scene it was taken from', () => {
    // The scenes stay the visual source; this file is only where the numbers are
    // written down once. A slot with no scene behind it is a number somebody
    // invented here, which is the one thing this file must not become.
    for (const slot of Object.keys(CENTRE_SLOTS) as CentreSlot[]) {
      expect(CENTRE_SLOTS[slot].from, slot).toMatch(/Story/)
    }
  })

  it('never puts two places of one situation at the same spot unlayered', () => {
    // Sharing a spot is legal and sometimes the point — the cover lies exactly
    // over the attack. What is not legal is sharing it with no layer to say
    // which is on top: the second card would sit invisibly under the first, and
    // which one that is would be decided by document order.
    for (const [set, places] of Object.entries(CENTRE_SETS)) {
      const seen = new Map<number, number | undefined>()
      for (const [slot, place] of Object.entries(places) as [CentreSlot, CentrePlace][]) {
        const { dx } = CENTRE_SLOTS[slot]
        if (seen.has(dx)) {
          expect(place.z, `${set} → ${slot} shares dx ${dx} with no layer`).toBeDefined()
          expect(place.z, `${set} → ${slot}`).not.toBe(seen.get(dx))
        }
        seen.set(dx, place.z)
      }
    }
  })
})
