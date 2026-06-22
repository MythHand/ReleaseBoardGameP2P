import { useEffect, useRef, useState } from 'react'
import Hand from '@/table/Hand'
import Seat from '@/table/Seat'
import ReleaseZone from '@/table/ReleaseZone'
import Pile from '@/primitives/Pile'
import MoveHistory from '@/table/MoveHistory'
import GameModes from '@/table/GameModes'
import Participants from '@/table/Participants'
import GameOver from '@/table/GameOver'
import Rules from '@/screens/Start/Rules'
import styles from './Table.module.css'

// Ширина выезжающей панели зависит от типа контента вкладки.
const DRAWER_WIDTH = {
  history: 420, // история — немного шире
  participants: 420, // участники — как история
  modes: 460, // режимы — немного шире
  rules: 680, // правила — сильно шире
}

// Стол = активное состояние игры. Каждый блок позиционируется независимо
// (абсолютно), без жёсткой сетки. Заполняет экран без скролла.
export default function Table({ state, over = null, onOverContinue, view = null }) {
  const { you, opponents, decks, turn, history, setup, participants, spectators } = state
  const [panel, setPanel] = useState(null) // 'history'|'participants'|'rules'|'modes'|null

  // завершение партии — оверлей поверх стола (триггерится извне)
  const overWinner = over ? participants.find((p) => p.id === over.winnerId) : null

  // при выбывании все карты игрока (стол + рука) уходят в сброс → зоны убираются
  const EMPTY_RELEASE = { frontend: null, backend: null, database: null }
  const youEliminated = view === 'youEliminated'

  const toggle = (p) => setPanel((cur) => (cur === p ? null : p))

  // при закрытии держим ширину последней открытой вкладки — чтобы панель
  // уезжала своей шириной, без скачка; при смене вкладок width плавно меняется
  const lastOpen = useRef('history')
  useEffect(() => {
    if (panel) lastOpen.current = panel
  }, [panel])
  const drawerWidth = DRAWER_WIDTH[panel ?? lastOpen.current]

  return (
    <div className={styles.table}>
      <div className={styles.opponents}>
        {opponents.map((p, i) => {
          const eliminated = view === 'oppEliminated' && i === 0
          const disconnected = view === 'oppDisconnect' && i === 0
          // выбыл → карты в сброс: пустая зона релиза, рука = 0
          const shown = eliminated ? { ...p, handCount: 0, release: EMPTY_RELEASE } : p
          return (
            <Seat
              key={p.id}
              player={shown}
              active={turn === p.id}
              eliminated={eliminated}
              disconnected={disconnected}
            />
          )
        })}
      </div>

      <div className={styles.decks}>
        <Pile label="колода" deck="base" count={decks.main} width="150px" countPos="tl" />
        <Pile label="события" deck="ai" count={decks.events} width="150px" countPos="tl" />
      </div>

      <div className={styles.discard}>
        <Pile label="сброс" topCard={decks.discard} count={decks.discardCount} width="116px" />
      </div>

      <div className={styles.you}>
        {youEliminated ? (
          <div className={styles.youBadge}>вы выбыли из игры</div>
        ) : (
          <>
            <ReleaseZone release={you.release} size="100px" />
            <div className={styles.handWrap}>
              <Hand items={you.hand} />
            </div>
          </>
        )}
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
          className={`${styles.tab} ${panel === 'participants' ? styles.tabOn : ''}`}
          onClick={() => toggle('participants')}
        >
          участники
        </button>
        <button
          className={`${styles.tab} ${panel === 'rules' ? styles.tabOn : ''}`}
          onClick={() => toggle('rules')}
        >
          правила
        </button>
        <button
          className={`${styles.tab} ${panel === 'modes' ? styles.tabOn : ''}`}
          onClick={() => toggle('modes')}
        >
          игровой режим
        </button>
      </div>

      {/* выезжающая панель поверх контента */}
      <div
        className={`${styles.drawer} ${panel ? styles.drawerOpen : ''}`}
        style={{ width: drawerWidth }}
      >
        {panel === 'history' && <MoveHistory entries={history} />}
        {panel === 'participants' && (
          <Participants players={participants} spectators={spectators} />
        )}
        {panel === 'rules' && (
          <div className={styles.scrollPanel}>
            <Rules />
          </div>
        )}
        {panel === 'modes' && <GameModes setup={setup} />}
      </div>

      {view === 'youDisconnect' && (
        <div className={styles.reconnect}>
          <div className={styles.reconnectBox}>
            <span className={styles.spinner} aria-hidden="true" />
            переподключение…
          </div>
        </div>
      )}

      {over && (
        <GameOver
          winner={overWinner}
          condition={over.condition}
          onContinue={onOverContinue}
        />
      )}
    </div>
  )
}
