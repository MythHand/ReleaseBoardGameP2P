import '@release/ui/tokens.css'
import '@release/ui/global.css'
import type { Action, CardInstance, Event } from '@release/engine'
import { cardsPresent } from '@release/engine'
import { botAction } from '@release/engine/fake'
import { useTranslation } from '@release/translation'
import { Button, Typography } from '@release/ui'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { toBoardOver, toBoardState } from '~/entities/game/board'
import { useNow } from '~/features/play-game/useNow'
import { forViewer, rejectionsIn } from '~/network/session/audience'
import Board from '~/pages/board/[gameId]/_Board'
import { useDebugCopy } from './copy'
import { createScenario, engine, SCENARIOS, type Scenario, seedLog } from './scenarios'
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
  const [run, dispatch] = useReducer(reduceRun, undefined, (): Run => {
    const state = createScenario(scenario, gameId)
    // The seeded discard's own history, so the board can fold a heap out of
    // it (`seedLog`). Reported as already reflected below, so the queue
    // treats it as a table it arrived at rather than moves to replay.
    return { state, events: seedLog(state), last: null }
  })
  const [viewer, setViewer] = useState('you')
  // HOW MANY CARDS THIS GAME HAS, counted once at the scene's own start. The
  // count itself is the engine's — the same census its conformance check is
  // built on, which knows every place a card can be, the air between a hand and
  // the table included. Nothing is counted here; this is the comparison.
  const [dealt] = useState(() => cardsPresent(run.state).length)
  const held = cardsPresent(run.state).length
  // the last seeded event: everything at or below it is the starting table
  const [seeded] = useState(() => run.events.at(-1)?.id ?? 0)
  const [ready, setReady] = useState(false)
  const now = useNow(ready)
  const send = useCallback((intent: Intent) => dispatch({ ...intent, at: Date.now() }), [])
  const onIntroDone = useCallback(() => {
    setReady(true)
    send({ type: 'CLOCK_STARTED' })
  }, [send])
  const view = useMemo(() => engine.project(run.state, viewer), [run.state, viewer])
  const events = useMemo(() => forViewer(run.events, viewer), [run.events, viewer])
  const labels = t('historyLabels', { returnObjects: true }) as Record<Event['type'], string>
  const board = useMemo(() => toBoardState(view, events, labels), [view, events, labels])

  // Only reaction windows have a WINDOW_EXPIRED action. Turn inactivity
  // normally delegates to the keeper; keep debug turns manual for inspection.
  const deadline = run.state.window?.deadline
  useEffect(() => {
    if (!ready || run.state.over || run.state.pending || deadline == null || now < deadline) return
    send({ type: 'WINDOW_EXPIRED' })
  }, [deadline, now, ready, run.state.over, run.state.pending, send])

  const pending = run.state.pending
  // Deliberately manual, like the other debug scenarios: inspect the eliminated
  // viewer between beats, then let each remaining seat take its next real action.
  const nextBot =
    scenario === 'elimination'
      ? run.state.seating
          .filter((id) => id !== 'you')
          .map((id) => botAction(engine, run.state, id, now))
          .find((action) => action != null)
      : undefined
  // EVERY SEAT THAT OWES ONE, not the first of them. System Upgrade asks the
  // whole roster at once, and a shortcut that answers for one opponent shows
  // only the first card leaving — the scene is the several of them going
  // together, and with three seats at every table now it is two (owner, 22.09).
  const owing = (
    pending?.kind === 'systemUpgrade' && pending.phase === 'discarding' ? pending.owed : []
  )
    .filter((id) => id !== 'you')
    .map((id) => ({ id, card: run.state.players[id]?.hand[0] }))
    .filter((seat): seat is { id: string; card: CardInstance } => seat.card != null)

  return (
    <>
      <div className={styles.status}>
        <div className={styles.controls}>
          {/* The instruction shares the controls' row instead of owning one of
              its own: it is a sentence, and a sentence is the cheapest thing on
              this bar to give up height for. The whole of it stays reachable —
              `title` carries it when the row is too narrow to show it all. */}
          <Typography variant="footnote" className={styles.hint} title={debug(`${scenario}Hint`)}>
            {debug(`${scenario}Hint`)}
          </Typography>
          <Typography variant="footnote" data-status>
            {ready ? debug('ready') : debug('opening')}
            {' · '}
            {pending?.kind ?? debug('idle')}
            {/* …AND THE CARDS ADD UP, OR THEY DO NOT. The stand mounts the real
                board, so it is a game or it is nothing, and a game has the cards
                it has. Said on every state rather than at the start: a card lost
                or doubled by a PLAY shows as readily as one written wrong into a
                scene. Silent while it holds — a number nobody has to read is a
                number nobody will read when it matters. */}
            {held !== dealt && (
              <span data-cards-off>
                {' · '}
                {debug('cardsOff')} {held}/{dealt}
              </span>
            )}
          </Typography>
          <details className={styles.trace}>
            <summary>
              <Typography variant="footnote">{debug('trace')}</Typography>
            </summary>
            <Typography as="pre" base="code-sm" className={styles.traceContent}>
              {run.last
                ? JSON.stringify(
                    {
                      action:
                        'player' in run.last.action && run.last.action.player === viewer
                          ? run.last.action
                          : {
                              type: run.last.action.type,
                              ...('player' in run.last.action
                                ? { player: run.last.action.player }
                                : {}),
                            },
                      events: [
                        ...forViewer(run.last.events, viewer),
                        ...('player' in run.last.action && run.last.action.player === viewer
                          ? rejectionsIn(run.last.events)
                          : []),
                      ],
                    },
                    null,
                    2,
                  )
                : debug('noAction')}
            </Typography>
          </details>
        </div>
        {/* EVERYTHING YOU PRESS IS ON ITS OWN LINE, and the line above is
            everything you read: what the scenario asks of you, where the game
            is, and the trace. Mixed, the row changed height and slid its buttons
            sideways under the cursor every time a pending opened or closed —
            and the buttons are the half you are aiming at. */}
        <div className={styles.actions}>
          {scenario === 'elimination' && (
            <Button
              variant="tech"
              disabled={!nextBot}
              onClick={() => {
                if (nextBot) send(nextBot)
              }}
            >
              {debug('nextBot')}
            </Button>
          )}
          {run.state.seating.map((id) => (
            <Button
              key={id}
              variant="tech"
              aria-pressed={viewer === id}
              onClick={() => setViewer(id)}
            >
              {debug(
                id === 'you' ? 'viewerYou' : id === 'p2' ? 'viewerOpponent' : 'viewerObserver',
              )}
            </Button>
          ))}
          {pending && ['defend', 'requestCard', 'giveCard', 'stealCard'].includes(pending.kind) && (
            <Button
              variant="tech"
              onClick={() => {
                if (pending.kind === 'defend')
                  send({
                    type: 'RESOLVE',
                    player: pending.player,
                    choice: { kind: 'defend', card: null },
                  })
                if (pending.kind === 'requestCard')
                  send({
                    type: 'RESOLVE',
                    player: pending.player,
                    choice: { kind: 'requestCard', card: 'defense-hotfix' },
                  })
                if (pending.kind === 'stealCard')
                  send({
                    type: 'RESOLVE',
                    player: pending.player,
                    choice: { kind: 'stealCard', index: 0 },
                  })
                if (pending.kind === 'giveCard') {
                  const card = run.state.players[pending.player].hand.find(
                    (c) => c.id === pending.requested,
                  )
                  if (card)
                    send({
                      type: 'RESOLVE',
                      player: pending.player,
                      choice: { kind: 'giveCard', card: card.uid },
                    })
                }
              }}
            >
              {debug('advancePending')}
            </Button>
          )}
          {owing.length > 0 && (
            <Button
              variant="tech"
              onClick={() => {
                for (const seat of owing)
                  send({
                    type: 'RESOLVE',
                    player: seat.id,
                    choice: { kind: 'upgradeDiscard', card: seat.card.uid },
                  })
              }}
            >
              {debug('opponentDiscard')}
            </Button>
          )}
        </div>
      </div>
      <div className={styles.board} data-debug-game-id={gameId}>
        <Board
          key={viewer}
          state={board}
          over={toBoardOver(view)}
          now={now}
          intro={{
            gameId: `${gameId}:${viewer}`,
            view,
            events,
            // the seeded discard is where this table STARTS, not something it plays
            restoredThrough: seeded,
            onDone: onIntroDone,
          }}
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
              send({ type: 'PLAY', player: viewer, card, target, combo }),
            onResolve: (choice) => send({ type: 'RESOLVE', player: viewer, choice }),
            onDraw: (pile) => send({ type: 'DRAW', player: viewer, pile }),
            onPush: () => send({ type: 'PUSH', player: viewer }),
            onAttack: (card, combo) => send({ type: 'ATTACK', player: viewer, card, combo }),
            onPass: () => send({ type: 'PASS', player: viewer }),
            onUnpass: () => send({ type: 'UNPASS', player: viewer }),
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
