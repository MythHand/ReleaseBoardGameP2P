import '@release/ui/tokens.css'
import '@release/ui/global.css'
import type { Action, Event } from '@release/engine'
import { useTranslation } from '@release/translation'
import { Button, Typography } from '@release/ui'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { toBoardOver, toBoardState } from '~/entities/game/board'
import { useNow } from '~/features/play-game/useNow'
import Board from '~/pages/board/[gameId]/_Board'
import { useDebugCopy } from './copy'
import { createScenario, engine, SCENARIOS, type Scenario } from './scenarios'
import styles from './styles.module.css'

type Intent = Action extends infer A ? (A extends Action ? Omit<A, 'at'> : never) : never

interface Run {
  state: ReturnType<typeof createScenario>
  events: Event[]
  last: { action: Action; events: Event[] } | null
}

function reduceRun(run: Run, action: Action): Run {
  const result = engine.reduce(run.state, action)
  return {
    state: result.state,
    events: [...run.events, ...result.events],
    last: { action, events: result.events },
  }
}

function ScenarioRun({ scenario, gameId }: { scenario: Scenario; gameId: string }) {
  const { t, i18n } = useTranslation()
  const debug = useDebugCopy()
  const [run, dispatch] = useReducer(
    reduceRun,
    undefined,
    (): Run => ({
      state: createScenario(scenario, gameId),
      events: [],
      last: null,
    }),
  )
  const [ready, setReady] = useState(false)
  const now = useNow(ready)
  const send = useCallback((intent: Intent) => dispatch({ ...intent, at: Date.now() }), [])
  const onIntroDone = useCallback(() => {
    setReady(true)
    send({ type: 'CLOCK_STARTED' })
  }, [send])
  const view = useMemo(() => engine.project(run.state, 'you'), [run.state])
  const labels = t('historyLabels', { returnObjects: true }) as Record<Event['type'], string>
  const board = useMemo(() => toBoardState(view, run.events, labels), [view, run.events, labels])

  // Only reaction windows have a WINDOW_EXPIRED action. Turn inactivity
  // normally delegates to the keeper; keep debug turns manual for inspection.
  const deadline = run.state.window?.deadline
  useEffect(() => {
    if (!ready || run.state.over || run.state.pending || deadline == null || now < deadline) return
    send({ type: 'WINDOW_EXPIRED' })
  }, [deadline, now, ready, run.state.over, run.state.pending, send])

  const pending = run.state.pending
  const opponentCard = run.state.players.p2.hand[0]
  const opponentOwes =
    pending?.kind === 'systemUpgrade' &&
    pending.phase === 'discarding' &&
    pending.owed.includes('p2') &&
    opponentCard != null

  return (
    <>
      <div className={styles.status}>
        <Typography variant="footnote">{debug(`${scenario}Hint`)}</Typography>
        <div className={styles.controls}>
          <Typography variant="footnote" data-status>
            {ready ? debug('ready') : debug('opening')}
            {' · '}
            {pending?.kind ?? debug('idle')}
          </Typography>
          {opponentOwes && (
            <Button
              variant="tech"
              onClick={() =>
                send({
                  type: 'RESOLVE',
                  player: 'p2',
                  choice: { kind: 'upgradeDiscard', card: opponentCard.uid },
                })
              }
            >
              {debug('opponentDiscard')}
            </Button>
          )}
          <details className={styles.trace}>
            <summary>
              <Typography variant="footnote">{debug('trace')}</Typography>
            </summary>
            <Typography as="pre" base="code-sm" className={styles.traceContent}>
              {run.last ? JSON.stringify(run.last, null, 2) : debug('noAction')}
            </Typography>
          </details>
        </div>
      </div>
      <div className={styles.board} data-debug-game-id={gameId}>
        <Board
          state={board}
          over={toBoardOver(view)}
          now={now}
          intro={{ gameId, view, events: run.events, onDone: onIntroDone }}
          room={{
            role: 'host',
            participants: run.state.seating.map((id) => ({
              id,
              name: run.state.players[id].name,
              connected: true,
            })),
            spectators: [],
            lang: i18n.resolvedLanguage === 'ru' ? 'ru' : 'en',
            onLangChange: (lang) => void i18n.changeLanguage(lang),
          }}
          copy={{
            table: t('table', { returnObjects: true }),
            modes: t('gameModes', { returnObjects: true }),
            rules: t('rulesBlock', { returnObjects: true }),
            seat: t('seat', { returnObjects: true }),
            participants: t('participants', { returnObjects: true }),
            history: t('moveHistory', { returnObjects: true }),
            reconnect: t('reconnect', { returnObjects: true }),
            gameOver: t('gameOver', { returnObjects: true }),
            lobbyCode: t('lobbyCode', { returnObjects: true }),
            turnDock: t('turnDock', { returnObjects: true }),
            pending: t('pending', { returnObjects: true }),
            window: t('window', { returnObjects: true }),
          }}
          actions={{
            onPlay: (card, target, combo) =>
              send({ type: 'PLAY', player: 'you', card, target, combo }),
            onResolve: (choice) => send({ type: 'RESOLVE', player: 'you', choice }),
            onDraw: (pile) => send({ type: 'DRAW', player: 'you', pile }),
            onPush: () => send({ type: 'PUSH', player: 'you' }),
            onAttack: (card, combo) => send({ type: 'ATTACK', player: 'you', card, combo }),
            onPass: () => send({ type: 'PASS', player: 'you' }),
            onUnpass: () => send({ type: 'UNPASS', player: 'you' }),
          }}
        />
      </div>
    </>
  )
}

function App() {
  const debug = useDebugCopy()
  const [selection, setSelection] = useState(() => ({
    scenario: SCENARIOS[0] as Scenario,
    gameId: crypto.randomUUID(),
  }))
  const select = (scenario: Scenario) => setSelection({ scenario, gameId: crypto.randomUUID() })

  return (
    <main className={styles.app}>
      <nav className={styles.toolbar} aria-label={debug('title')}>
        <Typography variant="metaLabel">{debug('title')}</Typography>
        {SCENARIOS.map((scenario) => (
          <Button
            key={scenario}
            variant="tech"
            aria-pressed={selection.scenario === scenario}
            onClick={() => select(scenario)}
          >
            {debug(scenario)}
          </Button>
        ))}
        <Button variant="tech" onClick={() => select(selection.scenario)}>
          {debug('restart')}
        </Button>
      </nav>
      <ScenarioRun key={selection.gameId} {...selection} />
    </main>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Debug root element not found')
createRoot(root).render(<App />)
