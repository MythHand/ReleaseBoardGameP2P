// Russian display copy for the playground stories. The @release/ui library is
// i18n-agnostic — components receive their user-visible strings via props — so
// the playground (a consuming app) supplies the copy here. Real apps pass their
// own translated copy (e.g. via react-i18next in the frontend).
import type { ModesCopy } from '@/game/modes'

export const RU_MODES: ModesCopy = {
  handLimit: {
    title: 'Лимит карт в руке (в конце хода)',
    options: {
      base: { label: 'Base', desc: 'Без ограничений' },
      '8bit': { label: '8 bit', desc: 'Не более 8 карт' },
      memory: { label: 'Memory Problem', desc: 'Не более 5 карт' },
    },
  },
  releases: {
    title: 'Количество релизов за ход',
    options: {
      base: { label: 'Base', desc: 'Не более 1' },
      fast: { label: 'Fast Release', desc: 'Без ограничений' },
    },
  },
  releaseCond: {
    title: 'Условие релиза',
    options: {
      base: { label: 'Base', desc: 'Сброс 1 карты за релиз' },
      easy: { label: 'Easy Release', desc: 'Без сброса карт за релиз' },
    },
  },
  ai: {
    title: 'Кол-во AI в игре',
    options: {
      base: { label: 'Base', desc: 'Без изменений' },
      less: { label: 'Less AI Random', desc: 'Убрать: 6 AI карт, 1 Error 503, 1 Debugger' },
      no: { label: 'No AI', desc: 'Убрать: все AI карты, 1 Error 503, 2 Debugger' },
    },
  },
  gitBranch: {
    title: 'Последствия Git Branch',
    options: {
      base: { label: 'Base', desc: 'Добор из всех колод' },
      strategic: { label: 'Strategic', desc: 'Добор только из одной колоды' },
    },
  },
}
