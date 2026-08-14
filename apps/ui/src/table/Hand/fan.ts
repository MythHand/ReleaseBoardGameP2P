// ЕДИНЫЙ ИСТОЧНИК ГЕОМЕТРИИ ВЕЕРА РУКИ.
// Раскладка слотов в Hand и приземление вставки (useHandInsert) считаются по
// ОДНОЙ формуле отсюда — чтобы не держать копии констант, которые молча
// разъезжаются при тюнинге веера. Тюнинг (наклон/дуга/шаг) меняем здесь.

export const CARD_W = 150 // ширина карты в руке, px
export const SPREAD_DEG = 3.8 // наклон между соседними картами, deg (спокойнее)
export const ARC_DROP = 2.5 // провисание краёв дуги, px (сильно плавнее, но не ровно)

// Шаг между картами плавно ужимается с ростом руки — гладкая (квадратичная)
// кривая через опорные точки [кол-во, шаг_px]. Меньше шаг → плотнее нахлёст.
// Чуть шире, чем раньше (симметрично влево/вправо).
const STEP_ANCHORS: [number, number][] = [
  [2, 136],
  [8, 92],
  [20, 54],
]

export function handStep(n: number): number {
  const [[x0, y0], [x1, y1], [x2, y2]] = STEP_ANCHORS
  const l0 = ((n - x1) * (n - x2)) / ((x0 - x1) * (x0 - x2))
  const l1 = ((n - x0) * (n - x2)) / ((x1 - x0) * (x1 - x2))
  const l2 = ((n - x0) * (n - x1)) / ((x2 - x0) * (x2 - x1))
  return y0 * l0 + y1 * l1 + y2 * l2
}

// ===== HOW A CARD ENTERS THE FAN =====
//
// A card released over the hand has to end up BETWEEN two cards. Here every card
// is drawn OVER its left neighbour and UNDER its right one, while a card on the
// cursor is drawn over all of them — so entering means going from "above the
// right neighbour" to "below" it, and there is no half of that switch: a card is
// above another card or it is not. Made where the card stands still, the whole
// strip where the two overlap (CARD_W minus the step — 58px at eight cards in
// hand, 96px at twenty) changes owner in one frame with nothing moving to
// account for it, and that reads as a jump.
//
// So the rule: a card comes into its slot ROUND FROM THE LEFT, and changes layer
// at the middle of that sweep — where it stands furthest from its right
// neighbour, so the strip changing hands is at its smallest, and where it is
// moving while it happens.
//
// One curve, not two legs. A waypoint would put a corner in the path and the
// card would stop dead in the middle of its own landing; a quadratic curve leans
// through the bend instead. It travels HALF way to its control point, so a
// control point one step out bulges the path half a step — the offset the layer
// switch wants.

// How far out the control point stands, in steps between cards. The fan's own
// unit, so the sweep breathes with the hand instead of being a px value that
// suits one hand size and looks wrong at every other.
const APPROACH_REACH = 1
// How far UP the arc it may ride. Which point of the arc is taken is read off
// how high the card was let go, so where you release shapes the curve instead of
// every release being funnelled through one fixed place. Off the HEIGHT alone,
// never off which side of the slot the card is on: a rule that flipped on
// crossing the slot would swing the whole curve on a pixel of pointer travel.
const APPROACH_RISE_DEG = 40
// How many positions the path is handed over as. Straight lines get drawn
// between them, so this is simply "often enough that no corner survives a frame".
const PATH_STEPS = 24

export interface Point {
  x: number
  y: number
}

/**
 * The path a card takes into slot `slot` of a layout of `total` slots: from
 * where the card is now (`from`) to where the slot is (`to`). Both must be the
 * SAME reference point of the card — its top-left, its bottom-centre pivot,
 * whichever the caller carries it by. The points are evenly spaced ALONG THE
 * PATH; the speed along it is the caller's business.
 *
 * The last slot has no neighbour on its right: nothing to tuck under, nothing to
 * come around. Its reach collapses to zero and the same curve is a straight line.
 */
export function insertPath(from: Point, to: Point, slot: number, total: number): Point[] {
  const reach = slot === total - 1 ? 0 : handStep(total) * APPROACH_REACH
  const rise = Math.min(
    Math.max(Math.atan2(to.y - from.y, Math.max(reach, 1)), 0),
    (APPROACH_RISE_DEG * Math.PI) / 180,
  )
  const cx = to.x - reach * Math.cos(rise)
  const cy = to.y - reach * Math.sin(rise)
  const path: Point[] = []
  for (let i = 0; i <= PATH_STEPS; i += 1) {
    const t = i / PATH_STEPS
    const u = 1 - t
    path.push({
      x: u * u * from.x + 2 * u * t * cx + t * t * to.x,
      y: u * u * from.y + 2 * u * t * cy + t * t * to.y,
    })
  }
  return path
}

export interface SlotPlacement {
  x: number // смещение по X от центра руки, px
  y: number // провисание по дуге, px
  rotate: number // наклон, deg
  z: number // слой (= индекс слота)
}

// Базовое место слота в раскладке из total слотов (без учёта ховера).
// slot — индекс слота, total — сколько слотов в раскладке.
export function slotPlacement(slot: number, total: number): SlotPlacement {
  const off = slot - (total - 1) / 2
  return {
    x: off * handStep(total),
    y: off ** 2 * ARC_DROP,
    rotate: off * SPREAD_DEG,
    z: slot,
  }
}
