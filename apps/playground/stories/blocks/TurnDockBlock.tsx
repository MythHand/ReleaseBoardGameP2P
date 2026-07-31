import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { useEffect, useState } from 'react'
import Button from '@/primitives/Button'
import Typography from '@/primitives/Typography'
import TurnDock, { type TurnDockState } from '@/table/TurnDock/TurnDock'
import { pick, useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from '../kit/KitShell'
import styles from './TurnDockBlock.module.css'

type Copy = typeof enCommon.turnDock

// per-phase clock length (s); danger reaction runs the shorter 10s window
const TOTAL: Record<TurnDockState, number> = { draw: 30, push: 30, waiting: 25, reaction: 15 }

interface Step {
  state: TurnDockState
  player?: string
  danger?: boolean
}

// a realistic loop for the auto walkthrough — successive opponents, a reaction
// window, back to your turn — so the transitions read the way they will in play
const AUTO: Step[] = [
  { state: 'draw' },
  { state: 'push' },
  { state: 'waiting', player: 'neo' },
  { state: 'waiting', player: 'trinity' },
  { state: 'reaction', player: 'trinity' },
  { state: 'waiting', player: 'morpheus' },
  { state: 'reaction', player: 'morpheus', danger: true },
  { state: 'draw' },
]

// Live TurnDock with a control bar: trigger each state change by hand (or auto-
// cycle) and watch the transition — text swaps, the «drawn» badge, the accent
// morph and the ring filling back to full on every new phase.
function TurnDockLive({ copy, ctl }: { copy: Copy; ctl: Record<string, string> }) {
  const [step, setStep] = useState<Step>({ state: 'draw' })
  const [seconds, setSeconds] = useState(TOTAL.draw)
  const [auto, setAuto] = useState(false)
  const [paused, setPaused] = useState(false)

  const { state, player = 'neo', danger = false } = step
  const total = danger ? 10 : TOTAL[state]

  // reset the clock to full on every phase / player / danger change → the ring
  // sweeps back up to full and recolours for the new phase
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset keys off the phase, not the derived total
  useEffect(() => {
    setSeconds(danger ? 10 : TOTAL[state])
  }, [state, player, danger])

  // tick down once a second (floors at 0); frozen while paused
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [paused])

  // auto walkthrough (also frozen while paused)
  useEffect(() => {
    if (!auto || paused) return
    let i = 0
    const id = setInterval(() => {
      i = (i + 1) % AUTO.length
      setStep(AUTO[i])
    }, 2600)
    return () => clearInterval(id)
  }, [auto, paused])

  const progress = total > 0 ? seconds / total : 0
  const go = (next: Step) => {
    setAuto(false)
    setStep(next)
  }

  return (
    <div className={styles.live}>
      <div className={styles.controls}>
        <Button variant="tech" onClick={() => go({ state: 'draw' })}>
          {ctl.draw}
        </Button>
        <Button variant="tech" onClick={() => go({ state: 'push' })}>
          {ctl.push}
        </Button>
        <span className={styles.spacer} aria-hidden="true" />
        <Button variant="tech" onClick={() => go({ state: 'waiting', player: 'neo' })}>
          {ctl.waitNeo}
        </Button>
        <Button variant="tech" onClick={() => go({ state: 'waiting', player: 'trinity' })}>
          {ctl.waitTrinity}
        </Button>
        <span className={styles.spacer} aria-hidden="true" />
        <Button variant="tech" onClick={() => go({ state: 'reaction', player: 'neo' })}>
          {ctl.reaction}
        </Button>
        <Button
          variant="tech"
          onClick={() => go({ state: 'reaction', player: 'neo', danger: true })}
        >
          {ctl.danger}
        </Button>
        <span className={styles.spacer} aria-hidden="true" />
        <Button variant="tech" onClick={() => setAuto((a) => !a)}>
          {auto ? ctl.autoOn : ctl.auto}
        </Button>
        <Button variant="tech" onClick={() => setPaused((p) => !p)}>
          {paused ? ctl.resume : ctl.pause}
        </Button>
      </div>
      <div className={styles.stage}>
        <TurnDock
          state={state}
          copy={copy}
          seconds={seconds}
          progress={progress}
          activePlayer={player}
          danger={danger}
          paused={paused}
        />
      </div>
    </div>
  )
}

// Turn dock — technical turn-control area on the Table screen (draw, end turn,
// turn timer). Custom game-HUD block. Live section shows the state transitions;
// the grid below shows every UI state statically, plus notes on the timer.
export default function TurnDockBlock() {
  const { lang } = useLang()
  // TurnDock strings come from the central catalog (single source of truth)
  const copy = (lang === 'en' ? enCommon : ruCommon).turnDock
  const w = pick(lang, {
    ru: {
      live: 'Переходы (живьё)',
      states: 'Состояния',
      draw: 'Ваш ход — нужен добор',
      push: 'Ваш ход — можно PUSH',
      waiting: 'Ход оппонента',
      reaction: 'Окно реакции — атака на релиз (янтарь)',
      reactionDanger: 'Окно реакции — Error 503 (danger, красный)',
      notesTitle: 'Наработки: поведение таймера',
      note1:
        'Свой ход — таймер бездействия, а не жёсткий лимит: продлевается на каждое осмысленное действие (сыграл/потянул карту, открыл прицел, добор). Обрубает только реально зависшего игрока — по таймауту авто-разрешение минимального хода (авто-добор → авто-PUSH) с предупреждением на последних секундах.',
      note2:
        'Окно реакции — время задано механикой правил: 15 сек первое окно, 10 сек каждый следующий раунд «продолжить атаку». Не выдумываем, только отображаем.',
      note3:
        'Цвет кольца — акцент по фазе: зелёный (свой ход), янтарный (реакция-атака), красный (danger — Error 503). При смене фазы кольцо дозаполняется до полного и перетекает в новый цвет. На ходе соперника кольцо потухшее и без числа — чужой таймер бездействия сбрасывается на каждое действие, наблюдателю показывать нечего.',
    },
    en: {
      live: 'Transitions (live)',
      states: 'States',
      draw: 'Your turn — draw required',
      push: 'Your turn — PUSH available',
      waiting: 'Opponent turn',
      reaction: 'Reaction window — attack a release (amber)',
      reactionDanger: 'Reaction window — Error 503 (danger, red)',
      notesTitle: 'Research: timer behaviour',
      note1:
        'Own turn — an inactivity timer, not a hard cap: it extends on every meaningful action (play/drag a card, open targeting, draw). Only a truly idle player gets cut off — on timeout, auto-resolve a minimal turn (auto-draw → auto-PUSH) with a warning in the final seconds.',
      note2:
        'Reaction window — time is defined by the rules: 15s for the first window, 10s for each follow-up “keep attacking” round. Not invented, only displayed.',
      note3:
        'Ring colour is the per-phase accent: green (your turn), amber (attack reaction), red (danger — Error 503). On a phase change the ring fills back to full and glides to the new colour. On the opponent’s turn the ring is dimmed with no number — their inactivity timer resets on every action, so there is nothing meaningful to show a watcher.',
    },
  })
  const ctl = pick(lang, {
    ru: {
      draw: 'ваш ход',
      push: 'после добора',
      waitNeo: 'ход neo',
      waitTrinity: 'ход trinity',
      reaction: 'реакция',
      danger: 'error 503',
      auto: 'авто',
      autoOn: 'авто ⏸',
      pause: 'пауза',
      resume: 'продолжить',
    },
    en: {
      draw: 'your turn',
      push: 'after draw',
      waitNeo: 'neo turn',
      waitTrinity: 'trinity turn',
      reaction: 'reaction',
      danger: 'error 503',
      auto: 'auto',
      autoOn: 'auto ⏸',
      pause: 'pause',
      resume: 'resume',
    },
  })

  return (
    <KitPage title="Turn dock" tag="block">
      <KitSection title={w.live}>
        <TurnDockLive copy={copy} ctl={ctl} />
      </KitSection>

      <KitSection title={w.states}>
        <KitCell caption={w.draw}>
          <TurnDock state="draw" copy={copy} seconds={21} progress={0.72} />
        </KitCell>
        <KitCell caption={w.push}>
          <TurnDock state="push" copy={copy} seconds={16} progress={0.55} />
        </KitCell>
        <KitCell caption={w.waiting}>
          <TurnDock state="waiting" copy={copy} seconds={25} progress={0.84} activePlayer="neo" />
        </KitCell>
        <KitCell caption={w.reaction}>
          <TurnDock state="reaction" copy={copy} seconds={8} progress={0.35} activePlayer="neo" />
        </KitCell>
        <KitCell caption={w.reactionDanger}>
          <TurnDock
            state="reaction"
            copy={copy}
            seconds={5}
            progress={0.2}
            activePlayer="neo"
            danger
          />
        </KitCell>
      </KitSection>

      <KitSection title={w.notesTitle}>
        <Typography variant="body">{w.note1}</Typography>
        <Typography variant="body">{w.note2}</Typography>
        <Typography variant="body">{w.note3}</Typography>
      </KitSection>
    </KitPage>
  )
}
