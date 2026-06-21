import { useState } from 'react'
import type { Card } from '@/cards/types'
import Hand from '@/table/Hand'
import type { HandItem } from '@/table/Hand/Hand'
import Seat from '@/table/Seat'
import ReleaseZone from '@/table/ReleaseZone'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import Pile from '@/primitives/Pile'
import MoveHistory from '@/table/MoveHistory'
import type { HistoryEntry } from '@/table/MoveHistory/MoveHistory'
import ModesInfo from '@/table/ModesInfo'
import type { GameMode } from '@/table/ModesInfo/ModesInfo'
import styles from './Table.module.css'

interface Opponent {
  id: string
  name: string
  handCount: number
  release: ReleaseSlots
}

interface TableState {
  you: {
    name: string
    hand: HandItem[]
    release: ReleaseSlots
  }
  opponents: Opponent[]
  decks: {
    main: number
    events: number
    discard?: Card | null
    discardCount: number
  }
  turn?: string
  history: HistoryEntry[]
  modes: GameMode[]
}

interface TableProps {
  state: TableState
}

// Стол = активное состояние игры. Каждый блок позиционируется независимо
// (абсолютно), без жёсткой сетки. Заполняет экран без скролла.
export default function Table({ state }: TableProps) {
  const { you, opponents, decks, turn, history, modes } = state
  const [panel, setPanel] = useState<'history' | 'settings' | null>(null)

  const toggle = (p: 'history' | 'settings') => setPanel((cur) => (cur === p ? null : p))

  return (
    <div className={styles.table}>
      <div className={styles.opponents}>
        {opponents.map((p) => (
          <Seat key={p.id} player={p} active={turn === p.id} />
        ))}
      </div>

      <div className={styles.decks}>
        <Pile label="колода" deck="base" count={decks.main} width="150px" countPos="tl" />
        <Pile label="события" deck="ai" count={decks.events} width="150px" countPos="tl" />
      </div>

      <div className={styles.discard}>
        <Pile label="сброс" topCard={decks.discard} count={decks.discardCount} width="116px" />
      </div>

      <div className={styles.you}>
        <ReleaseZone release={you.release} size="100px" />
        <div className={styles.handWrap}>
          <Hand items={you.hand} />
        </div>
      </div>

      {/* полоса кнопок во всю высоту у правого края (поверх контента) */}
      <div className={styles.bar}>
        <button
          className={`${styles.tab} ${panel === 'history' ? styles.tabOn : ''}`}
          onClick={() => toggle('history')}
        >
          история
        </button>
        <button
          className={`${styles.tab} ${panel === 'settings' ? styles.tabOn : ''}`}
          onClick={() => toggle('settings')}
        >
          настройки
        </button>
      </div>

      {/* выезжающая панель поверх контента */}
      <div className={`${styles.drawer} ${panel ? styles.drawerOpen : ''}`}>
        {panel === 'history' && <MoveHistory entries={history} />}
        {panel === 'settings' && <ModesInfo modes={modes} />}
      </div>
    </div>
  )
}
