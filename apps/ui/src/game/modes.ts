import type { ModeOption } from '@/primitives/ModeSelect'

// Structural definition of the game-mode groups — keys and option values only,
// no display copy. The library stays i18n-agnostic; consumers inject the copy
// (see ModesCopy / buildModes below).
export interface GameModeDef {
  key: string
  options: string[]
}

export const GAME_MODE_DEFS: GameModeDef[] = [
  { key: 'handLimit', options: ['base', '8bit', 'memory'] },
  { key: 'releases', options: ['base', 'fast'] },
  { key: 'releaseCond', options: ['base', 'easy'] },
  { key: 'ai', options: ['base', 'less', 'no'] },
  { key: 'gitBranch', options: ['base', 'strategic'] },
]

export type Setup = Record<string, string>

// дефолтный выбор — первый вариант (Base) в каждой группе
export const DEFAULT_SETUP: Setup = Object.fromEntries(
  GAME_MODE_DEFS.map((m): [string, string] => [m.key, m.options[0] ?? '']),
)

// Display copy for the mode groups, injected by the consuming app. Keyed by
// mode key, then by option value — so the structural defs and the copy stay in
// sync by key without the library embedding any user-visible strings.
export interface ModeOptionCopy {
  label: string
  desc: string
}
export interface GameModeCopy {
  title: string
  options: Record<string, ModeOptionCopy>
}
export type ModesCopy = Record<string, GameModeCopy>

// Render-ready shape consumed by ModeSelect.
export interface GameMode {
  key: string
  title: string
  options: ModeOption[]
}

// Merge the structural defs with injected copy into render-ready modes.
export function buildModes(copy: ModesCopy): GameMode[] {
  return GAME_MODE_DEFS.map((m) => ({
    key: m.key,
    title: copy[m.key]?.title ?? m.key,
    options: m.options.map((value) => ({
      value,
      label: copy[m.key]?.options[value]?.label ?? value,
      desc: copy[m.key]?.options[value]?.desc ?? '',
    })),
  }))
}
