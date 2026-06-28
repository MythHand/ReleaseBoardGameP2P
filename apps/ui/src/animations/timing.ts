// Тайминги для оркестрации анимаций — мелкие, но общие кирпичики.

/** Пауза на ms миллисекунд (для держания фаз между анимациями). */
export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Дождаться двух кадров — чтобы новый узел успел отрисоваться до старта анимации. */
export const nextFrames = (): Promise<void> =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
