import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import ReleaseLogo from '@/brand/ReleaseLogo'
import { buildModes, DEFAULT_SETUP, type ModesCopy, type Setup } from '@/game/modes'
import Button from '@/primitives/Button'
import Modal from '@/primitives/Modal'
import ModeSelect from '@/primitives/ModeSelect'
import styles from './Lobby.module.css'

interface Player {
  id: number
  name: string
  host: boolean
  ready: boolean
  online: boolean
}
interface Spectator {
  id: number
  name: string
}
interface MenuItemDef {
  label: string
  danger?: boolean
  disabled?: boolean
  hint?: string
  onClick: () => void
}

export interface LobbyCopy {
  title: string
  disband: string
  waiting: string
  gameCode: string
  copyCode: string
  modesTitle: string
  hostConfigures: string
  playersTitle: string
  capacity: string
  spectatorsTitle: string
  specLimit: string
  you: string
  hostTag: string
  ready: string
  notReady: string
  waitingStatus: string
  offline: string
  makeSpectator: string
  makePlayer: string
  noSlot: string
  kick: string
  emptySlot: string
  spectatorTag: string
  noSpectators: string
  startGame: string
  leave: string
  actions: string
  unavailable: string
  disbandTitle: string
  disbandText: string
  cancel: string
  modes: ModesCopy
}

interface LobbyProps {
  code?: string
  initialCapacity?: number
  initialPlayers?: Player[]
  role?: 'host' | 'guest'
  initialSetup?: Setup
  copy: LobbyCopy
}

// ⚠️ Каркас (WIP). Данные — моки. Сетевой/presence-слой придёт от логики;
// здесь только верстка и интерактив, что уже готов.
const MOCK_PLAYERS: Player[] = [
  { id: 1, name: 'dimbo', host: true, ready: true, online: true },
  { id: 2, name: 'neo', host: false, ready: true, online: true },
  { id: 3, name: 'trinity', host: false, ready: false, online: true },
  { id: 4, name: 'morpheus', host: false, ready: false, online: false },
]
const MOCK_SPECTATORS: Spectator[] = [
  { id: 101, name: 'oracle' },
  { id: 102, name: 'cypher' },
]

// светофор для лимита зрителей: 0–8 зелёный, 9–18 жёлтый, 19–28 красный
const SPEC_MAX = 28
function specColorFor(n: number) {
  if (n <= 8) return '#8fd9b0'
  if (n <= 18) return '#e3b341'
  return '#ff6b81'
}

export default function Lobby({
  code = '4F2A-9K',
  initialCapacity = 5,
  initialPlayers = MOCK_PLAYERS,
  role = 'host',
  initialSetup = DEFAULT_SETUP,
  copy,
}: LobbyProps) {
  const isHost = role === 'host'
  const meId = isHost ? 1 : 2 // кто «я» в этой сцене (мок)

  const [setup, setSetup] = useState<Setup>(initialSetup)
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [capacity, setCapacity] = useState(initialCapacity)
  const [spectators, setSpectators] = useState<Spectator[]>(MOCK_SPECTATORS)
  const [specCapacity, setSpecCapacity] = useState(8)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [menuHint, setMenuHint] = useState('')
  const [disbandOpen, setDisbandOpen] = useState(false)

  const openMenu = (id: number) => {
    setMenuHint('')
    setMenuFor((cur) => (cur === id ? null : id))
  }

  const specColor = specColorFor(specCapacity)
  const specPercent = (specCapacity / SPEC_MAX) * 100

  const setMode = (key: string, value: string) => setSetup((s) => ({ ...s, [key]: value }))
  const toggleReady = (id: number) =>
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ready: !p.ready } : p)))

  // модерация (host)
  const kick = (id: number) => {
    setPlayers((ps) => ps.filter((p) => p.id !== id))
    setMenuFor(null)
  }
  const kickSpectator = (id: number) => {
    setSpectators((ss) => ss.filter((s) => s.id !== id))
    setMenuFor(null)
  }
  const toSpectator = (id: number) => {
    const p = players.find((x) => x.id === id)
    if (!p) return
    setPlayers((ps) => ps.filter((x) => x.id !== id))
    setSpectators((ss) => [...ss, { id: p.id, name: p.name }])
    setMenuFor(null)
  }
  const toPlayer = (id: number) => {
    const s = spectators.find((x) => x.id === id)
    if (!s) return
    setSpectators((ss) => ss.filter((x) => x.id !== id))
    setPlayers((ps) => [...ps, { id: s.id, name: s.name, host: false, ready: false, online: true }])
    setMenuFor(null)
  }

  // закрываем меню «…» по клику вне его
  useEffect(() => {
    if (menuFor == null) return
    const onDoc = () => {
      setMenuFor(null)
      setMenuHint('')
    }
    window.addEventListener('click', onDoc)
    return () => window.removeEventListener('click', onDoc)
  }, [menuFor])

  // старт доступен, когда все онлайн-игроки готовы и их ≥2
  const online = players.filter((p) => p.online)
  const canStart = online.length >= 2 && online.every((p) => p.ready)
  const minCapacity = Math.max(2, players.length)

  const playersFull = players.length >= capacity
  const spectatorsFull = spectators.length >= specCapacity

  const slots: (Player | null)[] = [...players]
  while (slots.length < capacity) slots.push(null)

  const renderStatus = (p: Player) => {
    if (!p.online) return <span className={styles.statOff}>{copy.offline}</span>
    if (p.id === meId) {
      return (
        <button
          type="button"
          className={`${styles.readyBtn} ${p.ready ? styles.readyOn : ''}`}
          onClick={() => toggleReady(p.id)}
        >
          {p.ready ? copy.ready : copy.notReady}
        </button>
      )
    }
    return (
      <span className={`${styles.stat} ${p.ready ? styles.statReady : ''}`}>
        {p.ready ? copy.ready : copy.waitingStatus}
      </span>
    )
  }

  // меню «⋯» хоста
  const renderMenu = (id: number, items: MenuItemDef[]) => (
    <div className={styles.menuWrap}>
      <button
        type="button"
        className={styles.kebab}
        aria-label={copy.actions}
        onClick={(e) => {
          e.stopPropagation()
          openMenu(id)
        }}
      >
        ⋯
      </button>
      {menuFor === id && (
        <div className={styles.menu}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              className={`${styles.menuItem} ${it.danger ? styles.menuItemDanger : ''} ${
                it.disabled ? styles.menuItemDisabled : ''
              }`}
              onClick={(e) => {
                e.stopPropagation()
                // клик по задизейбленному пункту — показываем подсказку, не действуем
                if (it.disabled) setMenuHint(it.hint || copy.unavailable)
                else it.onClick()
              }}
            >
              {it.label}
            </button>
          ))}
          {menuHint && <div className={styles.menuHint}>{menuHint}</div>}
        </div>
      )}
    </div>
  )

  return (
    <div className={styles.lobby}>
      <header className={styles.head}>
        <div>
          <div className={styles.titleRow}>
            <ReleaseLogo className={styles.headLogo} blink={false} />
            <span className={styles.headDivider} />
            <h1 className={styles.title}>{copy.title}</h1>
            {isHost && (
              <Button
                variant="tech"
                className={styles.disbandBtn}
                onClick={() => setDisbandOpen(true)}
              >
                {copy.disband}
              </Button>
            )}
          </div>
          <p className={styles.sub}>{copy.waiting}</p>
        </div>
        <div className={styles.codeBox}>
          <span className={styles.codeLabel}>{copy.gameCode}</span>
          <div className={styles.codeRow}>
            <span className={styles.code}>{code}</span>
            <button className={styles.copy} type="button">
              {copy.copyCode}
            </button>
          </div>
        </div>
      </header>

      <div className={styles.grid}>
        {/* слева — режимы */}
        <section className={styles.modes}>
          <h2 className={styles.h}>
            {copy.modesTitle}
            {!isHost && <span className={styles.lockTag}>{copy.hostConfigures}</span>}
          </h2>
          <div className={styles.modeList}>
            {buildModes(copy.modes).map((m) => (
              <ModeSelect
                key={m.key}
                title={m.title}
                options={m.options}
                value={setup[m.key] ?? ''}
                onChange={(v) => setMode(m.key, v)}
                readOnly={!isHost}
              />
            ))}
          </div>
        </section>

        {/* справа — игроки, зрители, управление лобби */}
        <section className={styles.players}>
          <div className={styles.scrollArea}>
            <h2 className={styles.h}>
              {copy.playersTitle}
              <span className={styles.count}>
                {players.length} / {capacity}
              </span>
            </h2>

            {isHost && (
              <div className={styles.capRow}>
                <span className={styles.capLabel}>{copy.capacity}</span>
                <input
                  type="range"
                  className={styles.slider}
                  min={minCapacity}
                  max={6}
                  step={1}
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                />
                <span className={styles.capVal}>{capacity}</span>
              </div>
            )}

            <ul className={styles.list}>
              {slots.map((p, i) =>
                p ? (
                  <li
                    key={p.id}
                    className={`${styles.slot} ${!p.online ? styles.slotOff : ''} ${
                      p.id === meId ? styles.slotMe : ''
                    }`}
                  >
                    <span className={styles.avatar}>{p.name[0]?.toUpperCase()}</span>
                    <span className={styles.name}>
                      {p.name}
                      {p.id === meId && <span className={styles.you}> {copy.you}</span>}
                    </span>
                    {p.host && <span className={styles.hostTag}>{copy.hostTag}</span>}

                    <div className={styles.rowEnd}>
                      {renderStatus(p)}
                      {isHost &&
                        p.id !== meId &&
                        renderMenu(p.id, [
                          {
                            label: copy.makeSpectator,
                            onClick: () => toSpectator(p.id),
                            disabled: spectatorsFull,
                            hint: copy.noSlot,
                          },
                          { label: copy.kick, danger: true, onClick: () => kick(p.id) },
                        ])}
                    </div>
                  </li>
                ) : (
                  // biome-ignore lint/suspicious/noArrayIndexKey: пустые слоты — позиционные заглушки без стабильного id
                  <li key={`empty-${i}`} className={styles.slotEmpty}>
                    {copy.emptySlot}
                  </li>
                ),
              )}
            </ul>

            {/* зрители — второй независимый список */}
            <h2 className={`${styles.h} ${styles.hSpectators}`}>
              {copy.spectatorsTitle}
              <span className={styles.count}>
                {spectators.length} / {specCapacity}
              </span>
            </h2>

            {isHost && (
              <div className={styles.capRow}>
                <span className={styles.capLabel}>{copy.specLimit}</span>
                <input
                  type="range"
                  className={`${styles.slider} ${styles.sliderSpec}`}
                  min={0}
                  max={SPEC_MAX}
                  step={1}
                  value={specCapacity}
                  onChange={(e) => setSpecCapacity(Number(e.target.value))}
                  style={
                    {
                      '--spec-color': specColor,
                      background: `linear-gradient(90deg, ${specColor} ${specPercent}%, rgba(255,255,255,0.18) ${specPercent}%)`,
                    } as CSSProperties
                  }
                />
                <span className={styles.capVal} style={{ color: specColor }}>
                  {specCapacity}
                </span>
              </div>
            )}

            <ul className={styles.list}>
              {spectators.map((s) => (
                <li key={s.id} className={styles.slot}>
                  <span className={styles.avatar}>{s.name[0]?.toUpperCase()}</span>
                  <span className={styles.name}>{s.name}</span>
                  <div className={styles.rowEnd}>
                    <span className={styles.specTag}>{copy.spectatorTag}</span>
                    {isHost &&
                      renderMenu(s.id, [
                        {
                          label: copy.makePlayer,
                          onClick: () => toPlayer(s.id),
                          disabled: playersFull,
                          hint: copy.noSlot,
                        },
                        { label: copy.kick, danger: true, onClick: () => kickSpectator(s.id) },
                      ])}
                  </div>
                </li>
              ))}
              {spectators.length === 0 && <li className={styles.slotEmpty}>{copy.noSpectators}</li>}
            </ul>
          </div>

          <div className={styles.actions}>
            {isHost ? (
              <Button disabled={!canStart}>{copy.startGame}</Button>
            ) : (
              <Button>{copy.leave}</Button>
            )}
          </div>
        </section>
      </div>

      <Modal open={disbandOpen} onClose={() => setDisbandOpen(false)} title={copy.disbandTitle}>
        <p className={styles.confirmText}>{copy.disbandText}</p>
        <div className={styles.confirmActions}>
          <Button variant="tech" onClick={() => setDisbandOpen(false)}>
            {copy.cancel}
          </Button>
          <Button variant="tech" className={styles.danger} onClick={() => setDisbandOpen(false)}>
            {copy.disband}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
