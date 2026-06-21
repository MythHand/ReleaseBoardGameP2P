export type CategoryId =
  | 'release'
  | 'attack'
  | 'defense'
  | 'protection'
  | 'operation'
  | 'support'
  | 'trigger'
  | 'ai'

export type CardTag =
  | 'lightning'
  | 'sudo'
  | 'cancel'
  | 'unicorn'
  | 'trigger'
  | 'ai'
  | 'combo-source'

export interface Card {
  id: string
  name: string
  category: CategoryId
  deck: 'base' | 'ai'
  art: string
  tags: CardTag[]
  qty: number
}

export interface Category {
  id: CategoryId
  label: string
  accent: string
}
