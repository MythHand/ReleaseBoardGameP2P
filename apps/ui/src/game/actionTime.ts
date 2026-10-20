// How much time every action gets, as a multiple of the game's own — a host
// setting of the room. More time to think, not a faster game: 2 is twice the
// time for every turn and answer (owner, 19.10).
export const ACTION_TIME_SCALES = [1, 2, 3] as const
export type ActionTimeScale = (typeof ACTION_TIME_SCALES)[number]

export function isActionTimeScale(value: unknown): value is ActionTimeScale {
  return ACTION_TIME_SCALES.some((n) => n === value)
}
