// Data + logic
export { CATEGORIES } from './cards/categories'
export {
  CARDS, COVERS, assetUrl, cardById, cardCanTarget, isComboSource, validComboTarget,
} from './cards/catalogue'
// The card *type* is re-exported as `CardData` to avoid colliding with the `Card`
// *component* default export below. Internally the type stays named `Card`.
export type { Card as CardData, CategoryId, CardTag, Category } from './cards/types'
export { PRESETS, play, presetNames } from './animations'
export { buildSequence } from './boot/lines'

// Components (added/uncommented as Task 4 migrates each)
export { default as Card } from './primitives/Card'
export { default as Arrow } from './primitives/Arrow'
export { default as Pile } from './primitives/Pile'
export { default as Button } from './primitives/Button'
export { default as Modal } from './primitives/Modal'
export { default as Hand } from './table/Hand'
export { default as Table } from './table/Table'
export { default as ReleaseZone } from './table/ReleaseZone'
export { default as Seat } from './table/Seat'
export { default as MoveHistory } from './table/MoveHistory'
export { default as ModesInfo } from './table/ModesInfo'
export { default as Start } from './screens/Start'
export { default as Loader } from './boot'
