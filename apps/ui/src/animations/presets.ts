// СЛОВАРЬ АНИМАЦИЙ — реестр пресетов с человекопонятными именами.
// Вызов по смыслу: play('flipCard', el). Движок-исполнитель (сейчас нативный
// Web Animations API) можно сменить позже, не трогая места вызова.
//
// Принцип: НЕ набиваем заготовками на будущее. Только то, что уже реально
// применяется. Словарь растёт по мере появления настоящих нужд.
//
// Пресет может быть:
//   - данными { keyframes, options }              — для простых самодостаточных,
//   - функцией (el, params) => Animation          — когда нужны параметры (направление и т.п.).

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'
const SNAP = 'cubic-bezier(0.2, 0.9, 0.1, 1)'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

interface MoveParams {
  from?: Rect
  to?: Rect
  rotate?: number
  dx?: number
  dy?: number
  // растворение по ходу полёта (для «поглощения» стопки целевой колодой)
  fade?: boolean
}

// Общий travel: перелёт элемента из прямоугольника from в прямоугольник to
// (translate по центрам + масштаб по ширине). Базис под все «полёты» карт.
// rotate/dx/dy — финальный разворот и доп. смещение (чтобы прилёт сразу был
// в правильной конечной позиции, без последующего рывка). fade — гасит opacity.
const move = (
  el: Element,
  { from, to, rotate = 0, dx = 0, dy = 0, fade = false }: MoveParams = {},
  duration = 460,
  easing = EASE,
): Animation | null => {
  if (!el || !from || !to) return null
  const mx = to.left + to.width / 2 - (from.left + from.width / 2) + dx
  const my = to.top + to.height / 2 - (from.top + from.height / 2) + dy
  const scale = to.width / from.width
  const start: Keyframe = { transform: 'translate(0, 0) scale(1) rotate(0deg)' }
  const end: Keyframe = {
    transform: `translate(${mx}px, ${my}px) scale(${scale}) rotate(${rotate}deg)`,
  }
  if (fade) {
    start.opacity = 1
    end.opacity = 0
  }
  return el.animate([start, end], { duration, easing, fill: 'forwards' })
}

// длительность из params (для travel-пресетов с переменным временем)
const durationOf = (p?: Record<string, unknown>, fallback = 520): number =>
  typeof p?.duration === 'number' ? p.duration : fallback

export type PresetFn = (el: Element, params?: Record<string, unknown>) => Animation | null

export interface PresetData {
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
}

export type Preset = PresetFn | PresetData

export const PRESETS: Record<string, Preset> = {
  // Переворот карты лицо↔рубашка. Используется самим компонентом Card.
  flipCard: (el: Element, { faceDown = false }: { faceDown?: boolean } = {}): Animation =>
    el.animate(
      [
        { transform: `rotateY(${faceDown ? 0 : 180}deg)` },
        { transform: `rotateY(${faceDown ? 180 : 0}deg)` },
      ],
      { duration: 420, easing: EASE, fill: 'forwards' },
    ),

  // FLIP-вылет: элемент уже стоит на новом месте, анимируем его «из» прошлого
  // прямоугольника from в текущую позицию (identity). Появление новой колоды/
  // карты из источника.
  flyFrom: (el: Element, p?: Record<string, unknown>): Animation | null => {
    const { from, duration = 520 } = (p ?? {}) as { from?: Rect; duration?: number }
    if (!from) return null
    const r = el.getBoundingClientRect()
    return el.animate(
      [
        { transform: `translate(${from.left - r.left}px, ${from.top - r.top}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration, easing: EASE, fill: 'forwards' },
    )
  },

  // ===== Розыгрыш карт (travel) =====
  // Выкладывание не-релиза в центр стола (видно всем).
  playToCenter: (el: Element, p?: Record<string, unknown>): Animation | null =>
    move(el, p as MoveParams, 480, EASE),
  // Релиз — в слот зоны релиза, с лёгким снап-приземлением.
  playToReleaseZone: (el: Element, p?: Record<string, unknown>): Animation | null =>
    move(el, p as MoveParams, 480, SNAP),
  // Перенос разыгранной карты из центра в сброс.
  centerToDiscard: (el: Element, p?: Record<string, unknown>): Animation | null =>
    move(el, p as MoveParams, 420, EASE),

  // ===== Операции над колодами (travel) =====
  // Стопка летит к целевой стопке и приземляется (сброс → новая колода).
  gatherToDeck: (el: Element, p?: Record<string, unknown>): Animation | null =>
    move(el, p as MoveParams, durationOf(p), EASE),
  // Поглощение: стопка/колода летит в целевую и растворяется (слияние колод).
  absorbToDeck: (el: Element, p?: Record<string, unknown>): Animation | null =>
    move(el, { ...(p as MoveParams), fade: true }, durationOf(p), EASE),
}
