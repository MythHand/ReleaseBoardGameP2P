import { PRESETS } from './presets'

/**
 * Проиграть пресет анимации по имени на DOM-элементе.
 * @param name    имя пресета из словаря (PRESETS)
 * @param el      целевой элемент
 * @param params  параметры: для функ-пресета — аргументы,
 *                для данных-пресета — переопределение options
 * @returns объект анимации (anim.finished — промис) либо null
 */
export function play(
  name: string,
  el: Element | null,
  params: Record<string, unknown> = {},
): Animation | null {
  const preset = PRESETS[name]
  if (!preset) {
    console.warn(`[animations] неизвестный пресет: "${name}"`)
    return null
  }
  if (!el) return null
  if (typeof preset === 'function') return preset(el, params)
  return el.animate(preset.keyframes, { ...preset.options, ...params })
}

/** Список имён пресетов словаря. */
export const presetNames = (): string[] => Object.keys(PRESETS)
