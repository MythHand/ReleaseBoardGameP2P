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
import { type Lang, pick, useLang } from '../../Playground/lang'
import HoverSelect from '../controls/HoverSelect'
import styles from './TableStory.module.css'

type GameOverCondition = 'release' | 'lastStanding'
type ViewState = 'oppEliminated' | 'youEliminated' | 'oppDisconnect' | 'youDisconnect'
type Loc = Record<Lang, string>

interface EndVariant {
  id: string
  label: Loc
  winnerId: string
  condition: GameOverCondition
}
interface ViewItem {
  id: ViewState
  label: Loc
}

// end-of-match variants — each as its own button so all are visible
const END_VARIANTS: EndVariant[] = [
  {
    id: 'win-release',
    label: { ru: 'победа: 3 релиза', en: 'win: 3 releases' },
    winnerId: 'you',
    condition: 'release',
  },
  {
    id: 'win-last',
    label: { ru: 'победа: последний', en: 'win: last standing' },
    winnerId: 'you',
    condition: 'lastStanding',
  },
  {
    id: 'opp-release',
    label: { ru: 'соперник: 3 релиза', en: 'opponent: 3 releases' },
    winnerId: 'p2',
    condition: 'release',
  },
]

// table states: elimination/disconnect of the opponent and of the player
const VIEW_STATES: ViewItem[] = [
  { id: 'oppEliminated', label: { ru: 'соперник выбыл', en: 'opponent out' } },
  { id: 'youEliminated', label: { ru: 'ты выбыл', en: 'you are out' } },
  { id: 'oppDisconnect', label: { ru: 'дисконнект соперника', en: 'opponent disconnect' } },
  { id: 'youDisconnect', label: { ru: 'твой дисконнект', en: 'your disconnect' } },
]

export default function TableStory() {
  const { lang, setLang } = useLang()
  const [opps, setOpps] = useState(3)
  const [end, setEnd] = useState<string | null>(null)
  const [view, setView] = useState<ViewState | null>(null)
  const [role, setRole] = useState<'host' | 'guest'>('host')
  const [specLimit, setSpecLimit] = useState(8)
  const [kicked, setKicked] = useState<Set<string>>(() => new Set())

  const base = useMemo(() => makeTable(opps), [opps])
  // spectators kicked by the host are removed from the roster
  const state = { ...base, spectators: base.spectators.filter((s) => !kicked.has(s.id)) }

  const variant = END_VARIANTS.find((v) => v.id === end)
  const none = pick(lang, { ru: '— нет —', en: '— none —' })

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <div className={styles.switch}>
          <button
            type="button"
            className={role === 'host' ? styles.on : ''}
            onClick={() => setRole('host')}
          >
            host
          </button>
          <button
            type="button"
            className={role === 'guest' ? styles.on : ''}
            onClick={() => setRole('guest')}
          >
            guest
          </button>
        </div>

        <HoverSelect
          label={pick(lang, { ru: 'оппонентов', en: 'opponents' })}
          value={String(opps)}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(v) => setOpps(Number(v))}
        />
        <span className={styles.total}>
          {pick(lang, { ru: 'всего', en: 'total' })}: {opps + 1}
        </span>

        <HoverSelect
          label={pick(lang, { ru: 'состояние', en: 'state' })}
          value={view ?? ''}
          options={[
            { value: '', label: none },
            ...VIEW_STATES.map((v) => ({ value: v.id, label: v.label[lang] })),
          ]}
          onChange={(v) => setView(v === '' ? null : (v as ViewState))}
        />

        <HoverSelect
          label={pick(lang, { ru: 'завершение', en: 'game end' })}
          value={end ?? ''}
          options={[
            { value: '', label: none },
            ...END_VARIANTS.map((v) => ({ value: v.id, label: v.label[lang] })),
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
          lang={lang}
          onLangChange={setLang}
          code="4F2A-9K"
          role={role}
          spectatorLimit={specLimit}
          onSpectatorLimitChange={setSpecLimit}
          onKickSpectator={(id) => setKicked((k) => new Set(k).add(id))}
        />
      </div>
    </div>
  )
}
