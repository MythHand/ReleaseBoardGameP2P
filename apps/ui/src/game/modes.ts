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
// Значения — в центральном каталоге (`common.json` → `gameModes`); консьюмер
// передаёт их пропсом, библиотека остаётся i18n-agnostic.
export interface GameModeCopy {
  title: string
  options: Record<string, string>
}
export type GameModesCopy = Record<string, GameModeCopy>
