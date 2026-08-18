import { useState } from 'react'
import Button from '@/primitives/Button'
import Typography from '@/primitives/Typography'
import PauseGame, { type PausePlayer } from '@/table/PauseGame/PauseGame'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'
import styles from './PauseGameBlock.module.css'

// mocked table — the local player is 'you' by id and carries a nickname like
// everyone else; being you is a mark, not a name. All start not-ready (red).
const SELF = 'you'
const INITIAL: PausePlayer[] = [
  { id: 'you', name: 'deadlock', ready: false },
  { id: 'p2', name: 'kernel_panic', ready: false },
  { id: 'p3', name: 'segfault', ready: false },
  { id: 'p4', name: 'null_ptr', ready: false },
]

interface Copy {
  title: string
  subtitle: string
  subtitleReady: string
  you: string
  host: string
  ready: string
  notReady: string
  resume: string
}

// Live pause window with a control bar: flip the host/guest role, toggle the
// other players' lamps (to preview a mixed / all-green table) and reset. The
// local player's own lamp is tapped inside the window itself — with the 1.5s
// anti-spam lockout — and the host's central resume button re-arms a fresh pause.
function PauseGameLive({ copy, ctl }: { copy: Copy; ctl: Record<string, string> }) {
  const [players, setPlayers] = useState<PausePlayer[]>(INITIAL)
  const [isHost, setIsHost] = useState(true)

  const toggle = (id: string) =>
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ready: !p.ready } : p)))
  const reset = () => setPlayers(INITIAL)

  const others = players.filter((p) => p.id !== SELF)
  // the host is the local player when acting as host, otherwise an opponent
  const hostId = isHost ? SELF : 'p2'

  return (
    <div className={styles.live}>
      <div className={styles.controls}>
        <Button variant="tech" onClick={() => setIsHost((h) => !h)}>
          {isHost ? ctl.host : ctl.guest}
        </Button>
        <span className={styles.spacer} aria-hidden="true" />
        {others.map((p) => (
          <Button key={p.id} variant="tech" onClick={() => toggle(p.id)}>
            {p.name}
          </Button>
        ))}
        <span className={styles.spacer} aria-hidden="true" />
        <Button variant="tech" onClick={reset}>
          {ctl.reset}
        </Button>
      </div>

      <div className={styles.stage}>
        <Typography base="mono-md" tk="tk-10" as="div" className={styles.filler}>
          {ctl.under}
        </Typography>
        <PauseGame
          players={players}
          selfId={SELF}
          hostId={hostId}
          isHost={isHost}
          onToggleReady={() => toggle(SELF)}
          onResume={reset}
          copy={copy}
        />
      </div>
    </div>
  )
}

// Pause game — the host-triggered pause window over the Table. Blocks the play
// area (not the right-hand nav), freezes the turn timer for everyone, and shows
// a readiness lamp per player. Host-only central resume button.
export default function PauseGameBlock() {
  const { lang } = useLang()
  const copy = pick(lang, {
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
  const ctl = pick(lang, {
    ru: { host: 'роль: хост', guest: 'роль: гость', reset: 'сброс', under: 'стол под окном' },
    en: {
      host: 'role: host',
      guest: 'role: guest',
      reset: 'reset',
      under: 'table under the window',
    },
  })
  const w = pick(lang, {
    ru: {
      live: 'Окно паузы (живьё)',
      notesTitle: 'Поведение',
      note1:
        'Лампочка готовности — по игроку, привязана к нику. Каждый жмёт только свою (по умолчанию красная); после тапа 1.5 сек глухота к нажатию — защита от спама зелёный/красный.',
      note2:
        'Оверлей блокирует игровую зону, но не правую навигацию: рейл и раскрытая панель остаются над scrim’ом (z-index окна ниже рейла и drawer).',
      note3:
        'Пауза — только у хоста. Резюм не гейтуется: лампочки лишь сигнал хосту, снять паузу можно центральной кнопкой или тем же тумблером в настройках. Таймер хода при этом заморожен у всех.',
    },
    en: {
      live: 'Pause window (live)',
      notesTitle: 'Behaviour',
      note1:
        'A readiness lamp per player, bound to the nick. Each player taps only their own (red by default); after a tap the lamp is deaf for 1.5s — anti-spam against green/red flicker.',
      note2:
        'The overlay blocks the play area but not the right-hand nav: the rail and any open drawer stay above the scrim (the window’s z-index sits below the rail and drawer).',
      note3:
        'Pause is host-only. Resume is ungated: the lamps only signal readiness to the host — the host un-pauses with the central button or the same settings toggle. The turn timer stays frozen for everyone.',
    },
  })

  return (
    <KitPage title="Pause game" tag="block">
      <KitSection title={w.live}>
        <PauseGameLive copy={copy} ctl={ctl} />
      </KitSection>

      <KitSection title={w.notesTitle}>
        <Typography variant="body">{w.note1}</Typography>
        <Typography variant="body">{w.note2}</Typography>
        <Typography variant="body">{w.note3}</Typography>
      </KitSection>
    </KitPage>
  )
}
