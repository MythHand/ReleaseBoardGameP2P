// The runner's pixel art, after the cards' own illustrations: a dark body
// under a neon edge in its category's colour. One character is one pixel of
// the world — `a` the accent (edge, spots, marks), `d` the dark body, `.` air.
// Rows read top to bottom; every row of a sprite is the same length.

export type Sprite = readonly string[]

// Bug — the card's ladybird: a dark dome with a centre line and spots, the head
// low at the front. Facing right, the way it runs.
const BUG_BODY: Sprite = [
  '....aaaaa.......',
  '..aadddddaa.....',
  '.addadddddda....',
  'adddddddaddda...',
  'addaddddddadaaa.',
  'adddddddddddadda',
  'adddddadddddadaa',
  '.aaaaaaaaaaaaaa.',
]

export const BUG_RUN_A: Sprite = [...BUG_BODY, '..a...a...a..a..', '.a...a...a..a...']
export const BUG_RUN_B: Sprite = [...BUG_BODY, '...a...a...a..a.', '....a...a...a..a']
// sitting, legs tucked under — the idle bug, waiting for a click
export const BUG_SIT: Sprite = [...BUG_BODY, '................', '..aa..aa..aa.aa.']

// Hotfix — the card's two crossed plasters, the pad where they meet.
export const HOTFIX: Sprite = [
  'aa......aa',
  'ada....ada',
  'adda..adda',
  '.addaadda.',
  '..adaada..',
  '..adaada..',
  '.addaadda.',
  'adda..adda',
  'ada....ada',
  'aa......aa',
]

// Monitoring — the card's screen of charts on its stand.
export const MONITOR: Sprite = [
  'aaaaaaaaaaaa',
  'adddddddddda',
  'adaaddddadda',
  'addddddadada',
  'adaaddadddda',
  'addddaddddda',
  'adaaddddddda',
  'aaaaaaaaaaaa',
  '.....aa.....',
  '...aaaaaa...',
]

export const sizeOf = (sprite: Sprite) => ({ w: sprite[0]?.length ?? 0, h: sprite.length })
