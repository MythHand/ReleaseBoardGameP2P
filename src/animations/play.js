import { PRESETS } from './presets.js'

/**
 * Проиграть пресет анимации по имени на DOM-элементе.
 * @param {string} name      имя пресета из словаря (PRESETS)
 * @param {Element} el       целевой элемент
 * @param {object} [params]  параметры: для функ-пресета — аргументы,
 *                           для данных-пресета — переопределение options
 * @returns {Animation|null} объект анимации (anim.finished — промис) либо null
 */
export function play(name, el, params = {}) {
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
export const presetNames = () => Object.keys(PRESETS)
