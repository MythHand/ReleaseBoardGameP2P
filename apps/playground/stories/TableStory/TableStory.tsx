import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { useMemo, useState } from 'react'
import { makeTable } from '@/mocks/table'
import Table from '@/table/Table'
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

// служебный док: демо-состояния (reaction503 = красная danger-реакция →
// в Table это state='reaction' + turnDockDanger)
type DockDemo = 'draw' | 'push' | 'waiting' | 'reaction' | 'reaction503'
const DOCK_STATES: { id: DockDemo; label: Loc }[] = [
  { id: 'draw', label: { ru: 'ход · добор', en: 'turn · draw' } },
  { id: 'push', label: { ru: 'ход · PUSH', en: 'turn · PUSH' } },
  { id: 'waiting', label: { ru: 'ход оппонента', en: 'opponent turn' } },
  { id: 'reaction', label: { ru: 'реакция', en: 'reaction' } },
  { id: 'reaction503', label: { ru: 'error 503', en: 'error 503' } },
]

export default function TableStory() {
  const { lang, setLang } = useLang()
  const [opps, setOpps] = useState(3)
  const [end, setEnd] = useState<string | null>(null)
  const [view, setView] = useState<ViewState | null>(null)
  const [role, setRole] = useState<'host' | 'guest'>('host')
  const [dock, setDock] = useState<DockDemo>('push')
  const [specLimit, setSpecLimit] = useState(8)
  const [kicked, setKicked] = useState<Set<string>>(() => new Set())
  const [paused, setPaused] = useState(false)
  const [ready, setReady] = useState<Set<string>>(() => new Set())

  const base = useMemo(() => makeTable(opps), [opps])
  // spectators kicked by the host are removed from the roster
  const state = { ...base, spectators: base.spectators.filter((s) => !kicked.has(s.id)) }

  const variant = END_VARIANTS.find((v) => v.id === end)
  const none = pick(lang, { ru: '— нет —', en: '— none —' })

  // pause window — readiness lamps built from the roster; the local player is
  // 'you', the host is 'you' when hosting, otherwise the first opponent
  const pausePlayers = state.participants.map((p) => ({
    id: p.id,
    name: p.name,
    ready: ready.has(p.id),
  }))
  const pauseHostId = role === 'host' ? 'you' : state.participants.find((p) => p.id !== 'you')?.id
  const togglePause = (on: boolean) => {
    setPaused(on)
    if (on) setReady(new Set()) // a fresh pause starts with everyone not-ready
  }
  const toggleSelfReady = () =>
    setReady((s) => {
      const next = new Set(s)
      if (next.has('you')) next.delete('you')
      else next.add('you')
      return next
    })
  const tableCopy = pick(lang, { ru: ruCommon.table, en: enCommon.table })
  const pauseCopy = pick(lang, {
    ru: {
      title: 'игра на паузе',
      subtitle: 'ждём готовности игроков',
      subtitleReady: 'хост возобновит игру',
      you: 'вы',
      host: 'хост',
      ready: 'готов',
      notReady: 'не готов',
      resume: 'продолжить игру',
    },
    en: {
      title: 'game paused',
      subtitle: 'waiting for players',
      subtitleReady: 'host will resume the game',
      you: 'you',
      host: 'host',
      ready: 'ready',
      notReady: 'not ready',
      resume: 'continue game',
    },
  })
  const pauseLabel = pick(lang, { ru: 'пауза игры', en: 'pause game' })
  const pauseHint = pick(lang, {
    ru: 'таймер хода замрёт у всех игроков',
    en: 'freezes the turn timer for everyone',
  })
  const generalTitle = pick(lang, { ru: 'общие', en: 'general' })
  const pauseOn = pick(lang, { ru: 'включена', en: 'on' })
  const pauseOff = pick(lang, { ru: 'выключена', en: 'off' })

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

        <HoverSelect
          label={pick(lang, { ru: 'состояние дока', en: 'dock state' })}
          value={dock}
          options={DOCK_STATES.map((d) => ({ value: d.id, label: d.label[lang] }))}
          onChange={(v) => setDock(v as DockDemo)}
        />
      </div>
      <div className={styles.stage}>
        <Table
          state={state}
          view={view}
          over={variant ? { winnerId: variant.winnerId, condition: variant.condition } : null}
          onOverContinue={() => setEnd(null)}
          modesCopy={pick(lang, { ru: ruCommon.gameModes, en: enCommon.gameModes })}
          rulesCopy={pick(lang, { ru: ruCommon.rulesBlock, en: enCommon.rulesBlock })}
          seatCopy={pick(lang, { ru: ruCommon.seat, en: enCommon.seat })}
          turnDockCopy={pick(lang, { ru: ruCommon.turnDock, en: enCommon.turnDock })}
          participantsCopy={pick(lang, { ru: ruCommon.participants, en: enCommon.participants })}
          historyCopy={pick(lang, { ru: ruCommon.moveHistory, en: enCommon.moveHistory })}
          reconnectCopy={pick(lang, { ru: ruCommon.reconnect, en: enCommon.reconnect })}
          gameOverCopy={pick(lang, { ru: ruCommon.gameOver, en: enCommon.gameOver })}
          copy={{ ...tableCopy, generalTitle, pauseGame: pauseLabel, pauseOn, pauseOff, pauseHint }}
          lobbyCodeCopy={pick(lang, { ru: ruCommon.lobbyCode, en: enCommon.lobbyCode })}
          lang={lang}
          onLangChange={setLang}
          code="4F2A-9K"
          role={role}
          spectatorLimit={specLimit}
          onSpectatorLimitChange={setSpecLimit}
          onKickSpectator={(id) => setKicked((k) => new Set(k).add(id))}
          turnDockState={dock === 'reaction503' ? 'reaction' : dock}
          turnDockDanger={dock === 'reaction503'}
          paused={paused}
          onPauseChange={togglePause}
          pausePlayers={pausePlayers}
          pauseSelfId="you"
          pauseHostId={pauseHostId}
          onPauseToggleReady={toggleSelfReady}
          pauseCopy={pauseCopy}
        />
      </div>
    </div>
  )
}
