import { useState } from 'react'
import GameSettings from '@/blocks/GameSettings'
import LangSwitcher, { type SwitchLang } from '@/blocks/LangSwitcher'
import LobbyCode, { LOBBY_CODE_COPY_EN, LOBBY_CODE_COPY_RU } from '@/blocks/LobbyCode'
import PlayerSlot, { EmptySlot } from '@/blocks/PlayerSlot'
import ReleaseLogo from '@/brand/ReleaseLogo'
import { DEFAULT_SETUP, MODES_COPY_EN, MODES_COPY_RU, type Setup } from '@/game/modes'
import Badge from '@/primitives/Badge'
import Button from '@/primitives/Button'
import Modal from '@/primitives/Modal'
import Slider from '@/primitives/Slider'
import Toggle from '@/primitives/Toggle'
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
interface LobbyProps {
  code?: string
  initialCapacity?: number
  initialPlayers?: Player[]
  role?: 'host' | 'guest'
  initialSetup?: Setup
  initialLang?: SwitchLang
}

// Весь видимый текст лобби приходит из набора по языку — экран сам переключает
// язык встроенным свитчером, поэтому держит оба набора и выбирает по lang.
export interface LobbyCopy {
  title: string
  subtitle: string
  language: string
  disband: string
  modes: string
  modesLockedHint: string
  players: string
  capacity: string
  spectators: string
  specLimit: string
  freeSlot: string
  noSpectators: string
  roleHost: string
  roleGuest: string
  you: string
  ready: string
  notReady: string
  waiting: string
  offline: string
  makeSpectator: string
  makePlayer: string
  kick: string
  noSlot: string
  unavailable: string
  actions: string
  start: string
  leave: string
  disbandTitle: string
  disbandText: string
  cancel: string
}

export const LOBBY_COPY_RU: LobbyCopy = {
  title: 'Лобби',
  subtitle: 'Ожидание игроков…',
  language: 'язык',
  disband: 'расформировать',
  modes: 'Режимы партии',
  modesLockedHint: 'настраивает host',
  players: 'Игроки',
  capacity: 'Вместимость',
  spectators: 'Зрители',
  specLimit: 'Лимит',
  freeSlot: 'свободный слот',
  noSpectators: 'пока без зрителей',
  roleHost: 'host',
  roleGuest: 'зритель',
  you: 'вы',
  ready: 'готов',
  notReady: 'не готов',
  waiting: 'ожидание',
  offline: 'не в сети',
  makeSpectator: 'Сделать зрителем',
  makePlayer: 'Сделать игроком',
  kick: 'Исключить',
  noSlot: 'Нет доступного слота',
  unavailable: 'Недоступно',
  actions: 'действия',
  start: 'начать игру',
  leave: 'покинуть',
  disbandTitle: 'Расформировать лобби?',
  disbandText:
    'Лобби будет закрыто, все подключённые игроки — отключены. Действие нельзя отменить.',
  cancel: 'отмена',
}

export const LOBBY_COPY_EN: LobbyCopy = {
  title: 'Lobby',
  subtitle: 'Waiting for players…',
  language: 'language',
  disband: 'disband',
  modes: 'Match modes',
  modesLockedHint: 'set by host',
  players: 'Players',
  capacity: 'Capacity',
  spectators: 'Spectators',
  specLimit: 'Limit',
  freeSlot: 'free slot',
  noSpectators: 'no spectators yet',
  roleHost: 'host',
  roleGuest: 'spectator',
  you: 'you',
  ready: 'ready',
  notReady: 'not ready',
  waiting: 'waiting',
  offline: 'offline',
  makeSpectator: 'Make spectator',
  makePlayer: 'Make player',
  kick: 'Kick',
  noSlot: 'No free slot',
  unavailable: 'Unavailable',
  actions: 'actions',
  start: 'start game',
  leave: 'leave',
  disbandTitle: 'Disband lobby?',
  disbandText:
    'The lobby will be closed and all connected players disconnected. This cannot be undone.',
  cancel: 'cancel',
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
  initialLang = 'ru',
}: LobbyProps) {
  const isHost = role === 'host'
  const meId = isHost ? 1 : 2 // кто «я» в этой сцене (мок)

  const [setup, setSetup] = useState<Setup>(initialSetup)
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [capacity, setCapacity] = useState(initialCapacity)
  const [spectators, setSpectators] = useState<Spectator[]>(MOCK_SPECTATORS)
  const [specCapacity, setSpecCapacity] = useState(8)
  const [disbandOpen, setDisbandOpen] = useState(false)
  const [lang, setLang] = useState<SwitchLang>(initialLang)

  // наборы текста по языку — экран держит оба и выбирает встроенным свитчером
  const copy = lang === 'en' ? LOBBY_COPY_EN : LOBBY_COPY_RU
  const modesCopy = lang === 'en' ? MODES_COPY_EN : MODES_COPY_RU
  const codeCopy = lang === 'en' ? LOBBY_CODE_COPY_EN : LOBBY_CODE_COPY_RU

  const specColor = specColorFor(specCapacity)

  const setMode = (key: string, value: string) => setSetup((s) => ({ ...s, [key]: value }))
  const toggleReady = (id: number) =>
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ready: !p.ready } : p)))

  // модерация (host)
  const kick = (id: number) => setPlayers((ps) => ps.filter((p) => p.id !== id))
  const kickSpectator = (id: number) => setSpectators((ss) => ss.filter((s) => s.id !== id))
  const toSpectator = (id: number) => {
    const p = players.find((x) => x.id === id)
    if (!p) return
    setPlayers((ps) => ps.filter((x) => x.id !== id))
    setSpectators((ss) => [...ss, { id: p.id, name: p.name }])
  }
  const toPlayer = (id: number) => {
    const s = spectators.find((x) => x.id === id)
    if (!s) return
    setSpectators((ss) => ss.filter((x) => x.id !== id))
    setPlayers((ps) => [...ps, { id: s.id, name: s.name, host: false, ready: false, online: true }])
  }

  // старт доступен, когда все онлайн-игроки готовы и их ≥2
  const online = players.filter((p) => p.online)
  const canStart = online.length >= 2 && online.every((p) => p.ready)
  const minCapacity = Math.max(2, players.length)

  const playersFull = players.length >= capacity
  const spectatorsFull = spectators.length >= specCapacity

  const slots: (Player | null)[] = [...players]
  while (slots.length < capacity) slots.push(null)

  const renderStatus = (p: Player) => {
    if (!p.online) return <Badge tone="muted">{copy.offline}</Badge>
    if (p.id === meId) {
      return (
        <Toggle on={p.ready} onChange={() => toggleReady(p.id)}>
          {p.ready ? copy.ready : copy.notReady}
        </Toggle>
      )
    }
    return <Badge tone={p.ready ? 'success' : 'muted'}>{p.ready ? copy.ready : copy.waiting}</Badge>
  }

  return (
    <div className={styles.lobby}>
      <header className={styles.head}>
        <div>
          <div className={styles.titleRow}>
            <ReleaseLogo className={styles.headLogo} blink={false} />
            <span className={styles.headDivider} />
            <h1 className={styles.title}>{copy.title}</h1>
            {isHost && (
              <Button variant="dangerGhost" onClick={() => setDisbandOpen(true)}>
                {copy.disband}
              </Button>
            )}
          </div>
          <p className={styles.sub}>{copy.subtitle}</p>
        </div>
        <div className={styles.headRight}>
          <LobbyCode code={code} copy={codeCopy} />
          <LangSwitcher value={lang} onChange={setLang} label={copy.language} />
        </div>
      </header>

      <div className={styles.grid}>
        {/* слева — режимы */}
        <section className={styles.modes}>
          <h2 className={styles.h}>
            {copy.modes}
            {!isHost && <span className={styles.lockTag}>{copy.modesLockedHint}</span>}
          </h2>
          <div className={styles.modeList}>
            <GameSettings setup={setup} onChange={setMode} readOnly={!isHost} copy={modesCopy} />
          </div>
        </section>

        {/* справа — игроки, зрители, управление лобби */}
        <section className={styles.players}>
          <div className={styles.scrollArea}>
            <h2 className={styles.h}>
              {copy.players}
              <span className={styles.count}>
                {players.length} / {capacity}
              </span>
            </h2>

            {isHost && (
              <Slider
                className={styles.capRow}
                label={copy.capacity}
                value={capacity}
                min={minCapacity}
                max={6}
                onChange={setCapacity}
              />
            )}

            <div className={styles.list}>
              {slots.map((p, i) =>
                p ? (
                  <PlayerSlot
                    key={p.id}
                    name={p.name}
                    me={p.id === meId}
                    youLabel={copy.you}
                    offline={!p.online}
                    badge={
                      p.host ? (
                        <Badge tone="success" size="sm" outlined>
                          {copy.roleHost}
                        </Badge>
                      ) : undefined
                    }
                    status={renderStatus(p)}
                    dropdownLabel={copy.actions}
                    dropdown={
                      isHost && p.id !== meId
                        ? [
                            {
                              label: copy.makeSpectator,
                              onClick: () => toSpectator(p.id),
                              disabled: spectatorsFull,
                              hint: copy.noSlot,
                            },
                            { label: copy.kick, danger: true, onClick: () => kick(p.id) },
                          ]
                        : undefined
                    }
                  />
                ) : (
                  // biome-ignore lint/suspicious/noArrayIndexKey: пустые слоты — позиционные заглушки без стабильного id
                  <EmptySlot key={`empty-${i}`}>{copy.freeSlot}</EmptySlot>
                ),
              )}
            </div>

            {/* зрители — второй независимый список */}
            <h2 className={`${styles.h} ${styles.hSpectators}`}>
              {copy.spectators}
              <span className={styles.count}>
                {spectators.length} / {specCapacity}
              </span>
            </h2>

            {isHost && (
              <Slider
                className={styles.capRow}
                label={copy.specLimit}
                value={specCapacity}
                min={0}
                max={SPEC_MAX}
                onChange={setSpecCapacity}
                color={specColor}
                fill
              />
            )}

            <div className={styles.list}>
              {spectators.map((s) => (
                <PlayerSlot
                  key={s.id}
                  name={s.name}
                  status={<Badge tone="muted">{copy.roleGuest}</Badge>}
                  dropdownLabel={copy.actions}
                  dropdown={
                    isHost
                      ? [
                          {
                            label: copy.makePlayer,
                            onClick: () => toPlayer(s.id),
                            disabled: playersFull,
                            hint: copy.noSlot,
                          },
                          { label: copy.kick, danger: true, onClick: () => kickSpectator(s.id) },
                        ]
                      : undefined
                  }
                />
              ))}
              {spectators.length === 0 && <EmptySlot>{copy.noSpectators}</EmptySlot>}
            </div>
          </div>

          <div className={styles.actions}>
            {isHost ? (
              <Button disabled={!canStart}>{copy.start}</Button>
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
