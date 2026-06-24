// Структура режимов партии (не переводится): ключи + значения опций + дефолты.
// label опции — константное имя режима (Base, 8 bit, …), одинаковое во всех языках.
export interface GameModeOption {
  value: string
  label: string
}

export interface GameMode {
  key: string
  options: GameModeOption[]
}

export type Setup = Record<string, string>

export const GAME_MODES: GameMode[] = [
  {
    key: 'handLimit',
    options: [
      { value: 'base', label: 'Base' },
      { value: '8bit', label: '8 bit' },
      { value: 'memory', label: 'Memory Problem' },
    ],
  },
  {
    key: 'releases',
    options: [
      { value: 'base', label: 'Base' },
      { value: 'fast', label: 'Fast Release' },
    ],
  },
  {
    key: 'releaseCond',
    options: [
      { value: 'base', label: 'Base' },
      { value: 'easy', label: 'Easy Release' },
    ],
  },
  {
    key: 'ai',
    options: [
      { value: 'base', label: 'Base' },
      { value: 'less', label: 'Less AI Random' },
      { value: 'no', label: 'No AI' },
    ],
  },
  {
    key: 'gitBranch',
    options: [
      { value: 'base', label: 'Base' },
      { value: 'strategic', label: 'Strategic' },
    ],
  },
]

// дефолтный выбор — первый вариант (Base) в каждой группе
export const DEFAULT_SETUP: Setup = Object.fromEntries(
  GAME_MODES.map((m): [string, string] => [m.key, m.options[0]?.value ?? '']),
)

// Переводимый текст: заголовок режима + описание каждой опции (по её value).
export interface GameModeCopy {
  title: string
  options: Record<string, string>
}
export type GameModesCopy = Record<string, GameModeCopy>

export const MODES_COPY_RU: GameModesCopy = {
  handLimit: {
    title: 'Лимит карт в руке (в конце хода)',
    options: { base: 'Без ограничений', '8bit': 'Не более 8 карт', memory: 'Не более 5 карт' },
  },
  releases: {
    title: 'Количество релизов за ход',
    options: { base: 'Не более 1', fast: 'Без ограничений' },
  },
  releaseCond: {
    title: 'Условие релиза',
    options: { base: 'Сброс 1 карты за релиз', easy: 'Без сброса карт за релиз' },
  },
  ai: {
    title: 'Кол-во AI в игре',
    options: {
      base: 'Без изменений',
      less: 'Убрать: 6 AI карт, 1 Error 503, 1 Debugger',
      no: 'Убрать: все AI карты, 1 Error 503, 2 Debugger',
    },
  },
  gitBranch: {
    title: 'Последствия Git Branch',
    options: { base: 'Добор из всех колод', strategic: 'Добор только из одной колоды' },
  },
}

export const MODES_COPY_EN: GameModesCopy = {
  handLimit: {
    title: 'Hand size limit (end of turn)',
    options: { base: 'No limit', '8bit': 'Max 8 cards', memory: 'Max 5 cards' },
  },
  releases: {
    title: 'Releases per turn',
    options: { base: 'Max 1', fast: 'No limit' },
  },
  releaseCond: {
    title: 'Release condition',
    options: { base: 'Discard 1 card per release', easy: 'No discard per release' },
  },
  ai: {
    title: 'AI count in game',
    options: {
      base: 'No change',
      less: 'Remove: 6 AI cards, 1 Error 503, 1 Debugger',
      no: 'Remove: all AI cards, 1 Error 503, 2 Debugger',
    },
  },
  gitBranch: {
    title: 'Git Branch consequences',
    options: { base: 'Draw from all decks', strategic: 'Draw from one deck only' },
  },
}
