// Data + logic

export { PRESETS, play, presetNames } from './animations'
export { default as GameSettings } from './blocks/GameSettings'
export { default as Loader } from './boot'
export { buildSequence } from './boot/lines'
export {
  assetUrl,
  CARDS,
  COVERS,
  cardById,
  cardCanTarget,
  isComboSource,
  validComboTarget,
} from './cards/catalogue'
export { CATEGORIES } from './cards/categories'
// The card *type* is re-exported as `CardData` to avoid colliding with the `Card`
// *component* default export below. Internally the type stays named `Card`.
export type { Card as CardData, CardTag, Category, CategoryId } from './cards/types'
export type { GameMode, GameModeCopy, GameModesCopy, Setup } from './game/modes'
export { DEFAULT_SETUP, GAME_MODES, MODES_COPY_EN, MODES_COPY_RU } from './game/modes'
export { NICKNAMES, randomNickname, sanitizeNickname } from './game/nicknames'
export { default as Arrow } from './primitives/Arrow'
export { default as Avatar } from './primitives/Avatar'
export type { BadgeTone } from './primitives/Badge'
export { default as Badge } from './primitives/Badge'
export { default as Button } from './primitives/Button'
// Components (added/uncommented as Task 4 migrates each)
export { default as Card } from './primitives/Card'
export { default as Input } from './primitives/Input'
export { default as Modal } from './primitives/Modal'
export type { ModeOption } from './primitives/ModeSelect'
export { default as ModeSelect } from './primitives/ModeSelect'
export { default as Pile } from './primitives/Pile'
export { default as Slider } from './primitives/Slider'
export { default as Toggle } from './primitives/Toggle'
export { default as Lobby } from './screens/Lobby'
export { default as Start } from './screens/Start'
export type { StartCopy } from './screens/Start/Start'
export type { StatPlayer, StatsCopy } from './screens/Stats'
export { default as Stats } from './screens/Stats'
export { default as GameModes } from './table/GameModes'
export { default as GameOver } from './table/GameOver'
export type { GameOverCondition } from './table/GameOver/GameOver'
export { default as Hand } from './table/Hand'
export { default as MoveHistory } from './table/MoveHistory'
export type { HistoryEntry } from './table/MoveHistory/MoveHistory'
export { default as Participants } from './table/Participants'
export type { Participant, Spectator } from './table/Participants/Participants'
export { default as ReleaseZone } from './table/ReleaseZone'
export { default as Seat } from './table/Seat'
export { default as Table } from './table/Table'
