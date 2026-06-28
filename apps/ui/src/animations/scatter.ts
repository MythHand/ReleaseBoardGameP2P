// Разброс карты в сбросе — лёгкий хаос угла и смещения. Пара к пресету
// centerToDiscard: посчитай разброс заранее и лети сразу в конечную позицию,
// чтобы не было рывка в финале.

export interface Scatter {
  rot: number
  dx: number
  dy: number
}

const ROT = 14 // макс. угол, градусы
const DX = 10 // макс. смещение по X, px
const DY = 8 // макс. смещение по Y, px

/** Случайный разброс карты в сбросе: угол ±14°, смещение ±10/±8 px. */
export const jitter = (): Scatter => ({
  rot: (Math.random() * 2 - 1) * ROT,
  dx: (Math.random() * 2 - 1) * DX,
  dy: (Math.random() * 2 - 1) * DY,
})
