// Конфиг режимов/модификаций партии. Общий для экрана создания и лобби,
// чтобы выбор хоста переносился из создания в лобби без дублирования.
export const GAME_MODES = [
  {
    key: 'handLimit',
    title: 'Лимит карт в руке (в конце хода)',
    options: [
      { value: 'base', label: 'Base', desc: 'Без ограничений' },
      { value: '8bit', label: '8 bit', desc: 'Не более 8 карт' },
      { value: 'memory', label: 'Memory Problem', desc: 'Не более 5 карт' },
    ],
  },
  {
    key: 'releases',
    title: 'Количество релизов за ход',
    options: [
      { value: 'base', label: 'Base', desc: 'Не более 1' },
      { value: 'fast', label: 'Fast Release', desc: 'Без ограничений' },
    ],
  },
  {
    key: 'releaseCond',
    title: 'Условие релиза',
    options: [
      { value: 'base', label: 'Base', desc: 'Сброс 1 карты за релиз' },
      { value: 'easy', label: 'Easy Release', desc: 'Без сброса карт за релиз' },
    ],
  },
  {
    key: 'ai',
    title: 'Кол-во AI в игре',
    options: [
      { value: 'base', label: 'Base', desc: 'Без изменений' },
      { value: 'less', label: 'Less AI Random', desc: 'Убрать: 6 AI карт, 1 Error 503, 1 Debugger' },
      { value: 'no', label: 'No AI', desc: 'Убрать: все AI карты, 1 Error 503, 2 Debugger' },
    ],
  },
  {
    key: 'gitBranch',
    title: 'Последствия Git Branch',
    options: [
      { value: 'base', label: 'Base', desc: 'Добор из всех колод' },
      { value: 'strategic', label: 'Strategic', desc: 'Добор только из одной колоды' },
    ],
  },
]

// дефолтный выбор — первый вариант (Base) в каждой группе
export const DEFAULT_SETUP = Object.fromEntries(
  GAME_MODES.map((m) => [m.key, m.options[0].value])
)
