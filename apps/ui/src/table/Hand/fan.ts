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
