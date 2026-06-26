import { useMemo, useState } from 'react'
import { RULES_COPY_EN, RULES_COPY_RU } from '@/blocks/Rules'
import { MODES_COPY_EN, MODES_COPY_RU } from '@/game/modes'
import { makeTable } from '@/mocks/table'
import { GAME_OVER_COPY_EN, GAME_OVER_COPY_RU } from '@/table/GameOver/GameOver'
import { MOVE_HISTORY_COPY_EN, MOVE_HISTORY_COPY_RU } from '@/table/MoveHistory/MoveHistory'
import { PARTICIPANTS_COPY_EN, PARTICIPANTS_COPY_RU } from '@/table/Participants/Participants'
import { RECONNECT_COPY_EN, RECONNECT_COPY_RU } from '@/table/Reconnect'
import { SEAT_COPY_EN, SEAT_COPY_RU } from '@/table/Seat/Seat'
import Table from '@/table/Table'
import { TABLE_COPY_EN, TABLE_COPY_RU } from '@/table/Table/Table'
import { pick, useLang } from '../../Playground/lang'
import HoverSelect from '../controls/HoverSelect'
import styles from './TableStory.module.css'

type GameOverCondition = 'release' | 'lastStanding'
type ViewState = 'oppEliminated' | 'youEliminated' | 'oppDisconnect' | 'youDisconnect'

interface EndVariant {
  id: string
  label: string
  winnerId: string
  condition: GameOverCondition
}
interface ViewItem {
  id: ViewState
  label: string
}

// варианты завершения партии — каждый отдельной кнопкой, чтобы все увидеть
const END_VARIANTS: EndVariant[] = [
  { id: 'win-release', label: 'победа: 3 релиза', winnerId: 'you', condition: 'release' },
  { id: 'win-last', label: 'победа: последний', winnerId: 'you', condition: 'lastStanding' },
  { id: 'opp-release', label: 'соперник: 3 релиза', winnerId: 'p2', condition: 'release' },
]

// состояния стола: выбывание/дисконнект соперника и самого игрока
const VIEW_STATES: ViewItem[] = [
  { id: 'oppEliminated', label: 'соперник выбыл' },
  { id: 'youEliminated', label: 'ты выбыл' },
  { id: 'oppDisconnect', label: 'дисконнект соперника' },
  { id: 'youDisconnect', label: 'твой дисконнект' },
]

export default function TableStory() {
  const { lang } = useLang()
  const [opps, setOpps] = useState(3)
  const [end, setEnd] = useState<string | null>(null)
  const [view, setView] = useState<ViewState | null>(null)
  const state = useMemo(() => makeTable(opps), [opps])

  const variant = END_VARIANTS.find((v) => v.id === end)

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <HoverSelect
          label="оппонентов"
          value={String(opps)}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(v) => setOpps(Number(v))}
        />
        <span className={styles.total}>всего: {opps + 1}</span>

        <HoverSelect
          label="состояние"
          value={view ?? ''}
          options={[
            { value: '', label: '— нет —' },
            ...VIEW_STATES.map((v) => ({ value: v.id, label: v.label })),
          ]}
          onChange={(v) => setView(v === '' ? null : (v as ViewState))}
        />

        <HoverSelect
          label="завершение"
          value={end ?? ''}
          options={[
            { value: '', label: '— нет —' },
            ...END_VARIANTS.map((v) => ({ value: v.id, label: v.label })),
          ]}
          onChange={(v) => setEnd(v === '' ? null : v)}
        />
      </div>
      <div className={styles.stage}>
        <Table
          state={state}
          view={view}
          over={variant ? { winnerId: variant.winnerId, condition: variant.condition } : null}
          onOverContinue={() => setEnd(null)}
          modesCopy={pick(lang, { ru: MODES_COPY_RU, en: MODES_COPY_EN })}
          rulesCopy={pick(lang, { ru: RULES_COPY_RU, en: RULES_COPY_EN })}
          seatCopy={pick(lang, { ru: SEAT_COPY_RU, en: SEAT_COPY_EN })}
          participantsCopy={pick(lang, { ru: PARTICIPANTS_COPY_RU, en: PARTICIPANTS_COPY_EN })}
          historyCopy={pick(lang, { ru: MOVE_HISTORY_COPY_RU, en: MOVE_HISTORY_COPY_EN })}
          reconnectCopy={pick(lang, { ru: RECONNECT_COPY_RU, en: RECONNECT_COPY_EN })}
          gameOverCopy={pick(lang, { ru: GAME_OVER_COPY_RU, en: GAME_OVER_COPY_EN })}
          copy={pick(lang, { ru: TABLE_COPY_RU, en: TABLE_COPY_EN })}
        />
      </div>
    </div>
  )
}
