// Data + logic

export { PRESETS, play, presetNames } from './animations'
export { default as GameSettings } from './blocks/GameSettings'
export type { SwitchLang } from './blocks/LangSwitcher'
export { default as LangSwitcher } from './blocks/LangSwitcher'
export type { LobbyCodeCopy } from './blocks/LobbyCode'
export { default as LobbyCode, LOBBY_CODE_COPY_EN, LOBBY_CODE_COPY_RU } from './blocks/LobbyCode'
export { default as Menu, MenuButton, MenuGroup } from './blocks/Menu'
export type { PhysicalEditionCopy } from './blocks/PhysicalEdition'
export {
  default as PhysicalEdition,
  PHYSICAL_EDITION_COPY_EN,
  PHYSICAL_EDITION_COPY_RU,
} from './blocks/PhysicalEdition'
export { default as PlayerSlot, EmptySlot } from './blocks/PlayerSlot'
export type { RulesCopy, RulesProps, RulesSection } from './blocks/Rules'
export { default as Rules, RULES_COPY_EN, RULES_COPY_RU } from './blocks/Rules'
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
export type { Point } from './primitives/Arrow'
export { centerOf, default as Arrow, useArrow } from './primitives/Arrow'
export { default as Avatar } from './primitives/Avatar'
export type { BadgeTone } from './primitives/Badge'
export { default as Badge } from './primitives/Badge'
export type { ButtonProps } from './primitives/Button'
export { default as Button } from './primitives/Button'
// Components (added/uncommented as Task 4 migrates each)
export { default as Card } from './primitives/Card'
export { default as CardPair } from './primitives/CardPair'
export { default as Drawer } from './primitives/Drawer'
export type { DropdownItem } from './primitives/Dropdown'
export { default as Dropdown } from './primitives/Dropdown'
export { default as EdgeGlow } from './primitives/EdgeGlow'
export type { InputHandle, InputProps } from './primitives/Input'
export { default as Input } from './primitives/Input'
export { default as Modal } from './primitives/Modal'
export type { ModeOption } from './primitives/ModeSelect'
export { default as ModeSelect } from './primitives/ModeSelect'
export { default as Overlay } from './primitives/Overlay'
export { default as Pile } from './primitives/Pile'
export { default as Slider } from './primitives/Slider'
export { default as Spinner } from './primitives/Spinner'
export type { TabRailItem } from './primitives/TabRail'
export { default as TabRail } from './primitives/TabRail'
export { default as Toggle } from './primitives/Toggle'
export type { InviteCopy, InviteState, JoinRole, SlotAvailability } from './screens/Invite'
export { default as Invite } from './screens/Invite'
export { default as Lobby } from './screens/Lobby'
export { default as Start } from './screens/Start'
export type { StartCopy } from './screens/Start/Start'
export type { StatPlayer, StatsCopy } from './screens/Stats'
export { default as Stats } from './screens/Stats'
export { default as GameModes } from './table/GameModes'
export { default as GameOver } from './table/GameOver'
export type { GameOverCondition, GameOverCopy } from './table/GameOver/GameOver'
export { GAME_OVER_COPY_EN, GAME_OVER_COPY_RU } from './table/GameOver/GameOver'
export { default as Hand } from './table/Hand'
export { default as MoveHistory } from './table/MoveHistory'
export type { HistoryEntry, MoveHistoryCopy } from './table/MoveHistory/MoveHistory'
export { MOVE_HISTORY_COPY_EN, MOVE_HISTORY_COPY_RU } from './table/MoveHistory/MoveHistory'
export { default as Participants } from './table/Participants'
export type { Participant, ParticipantsCopy, Spectator } from './table/Participants/Participants'
export { PARTICIPANTS_COPY_EN, PARTICIPANTS_COPY_RU } from './table/Participants/Participants'
export type { ReconnectCopy } from './table/Reconnect'
export { default as Reconnect, RECONNECT_COPY_EN, RECONNECT_COPY_RU } from './table/Reconnect'
export { default as ReleaseZone } from './table/ReleaseZone'
export { default as Seat } from './table/Seat'
export type { SeatCopy } from './table/Seat/Seat'
export { SEAT_COPY_EN, SEAT_COPY_RU } from './table/Seat/Seat'
export { default as Table } from './table/Table'
export type { TableCopy } from './table/Table/Table'
export { TABLE_COPY_EN, TABLE_COPY_RU } from './table/Table/Table'
