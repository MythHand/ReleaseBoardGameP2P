import { type ReactNode, useState } from 'react'
import BugRunner from '@/blocks/BugRunner'
import GameSettings from '@/blocks/GameSettings'
import LangSwitcher, { type SwitchLang } from '@/blocks/LangSwitcher'
import LobbyCode, { type LobbyCodeCopy } from '@/blocks/LobbyCode'
import PlayerSlot, { EmptySlot } from '@/blocks/PlayerSlot'
import Rules, { type RulesCopy } from '@/blocks/Rules'
import ReleaseLogo from '@/brand/ReleaseLogo'
import { DEFAULT_SETUP, type GameModesCopy, type Setup } from '@/game/modes'
import Badge from '@/primitives/Badge'
import Button from '@/primitives/Button'
import HudBackground, { type HudBackgroundTone } from '@/primitives/HudBackground'
import Modal from '@/primitives/Modal'
import ScrollArea from '@/primitives/ScrollArea'
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
  // ссылка-приглашение для копирования (мок в песочнице); выводится из кода,
  // если не передана — экран показывает две кнопки: «ссылка» и «код»
  link?: string
  // HUD-фон экрана (переключается снаружи — напр. из техстроки песочницы)
  bgTone?: HudBackgroundTone
  // экран сам переключает язык, поэтому копи из каталога приходит обоими языками
  lobbyCodeCopy: { ru: LobbyCodeCopy; en: LobbyCodeCopy }
  // текст режимов партии обоими языками — экран выбирает по внутреннему lang
  gameModesCopy: { ru: GameModesCopy; en: GameModesCopy }
  // текст правил обоими языками — экран выбирает по внутреннему lang
  rulesBlockCopy: { ru: RulesCopy; en: RulesCopy }
  // собственный текст экрана лобби обоими языками — выбирается по внутреннему lang
  lobbyScreenCopy: { ru: LobbyCopy; en: LobbyCopy }
  // чат третьей, самой правой колонкой. Слот, а не данные: экран не знает ни
  // откуда берутся сообщения, ни как они устроены — он только даёт им место.
  // Без слота колонки нет и сетка остаётся из двух, как была.
  chat?: ReactNode
}

// Весь видимый текст лобби приходит из набора по языку — экран сам переключает
// язык встроенным свитчером, поэтому держит оба набора и выбирает по lang.
export interface LobbyCopy {
  title: string
  subtitle: string
  language: string
  disband: string
  rules: string
  rulesTitle: string
  modes: string
  modesLockedHint: string
  players: string
  capacity: string
  addBot: string
  removeBot: string
  // Interpolated with the bot's number, the way the frontend's catalog does it.
  botName: string
  roleBot: string
  // заголовок колонки чата — сам блок чата своего заголовка не имеет
  chat: string
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
  leaveTitle: string
  leaveText: string
  // the header's mini-game, as a screen reader names it
  bugRunner: string
  cancel: string
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
  link,
  initialCapacity = 5,
  initialPlayers = MOCK_PLAYERS,
  role = 'host',
  initialSetup = DEFAULT_SETUP,
  initialLang = 'ru',
  bgTone = 'neutral',
  lobbyCodeCopy,
  gameModesCopy,
  rulesBlockCopy,
  lobbyScreenCopy,
  chat,
}: LobbyProps) {
  const isHost = role === 'host'
  const meId = isHost ? 1 : 2 // кто «я» в этой сцене (мок)

  const [setup, setSetup] = useState<Setup>(initialSetup)
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [capacity, setCapacity] = useState(initialCapacity)
  const [bots, setBots] = useState(0)
  const [spectators, setSpectators] = useState<Spectator[]>(MOCK_SPECTATORS)
  const [specCapacity, setSpecCapacity] = useState(8)
  const [disbandOpen, setDisbandOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [lang, setLang] = useState<SwitchLang>(initialLang)

  // наборы текста по языку — экран держит оба и выбирает встроенным свитчером
  const copy = lobbyScreenCopy[lang]
  const modesCopy = gameModesCopy[lang]
  const codeCopy = lobbyCodeCopy[lang]
  // мок ссылки-приглашения: та же форма, что и реальный shareUrl (origin/lobby/<code>)
  const shareLink = link ?? `release.game/lobby/${code}`
  const rulesCopy = rulesBlockCopy[lang]

  const specColor = specColorFor(specCapacity)

  const setMode = (key: string, value: string) => setSetup((s) => ({ ...s, [key]: value }))
  const me = players.find((p) => p.id === meId)
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

  // The same ceiling the app applies: people take the seats first, and the
  // number says how many of whatever is left should be bots.
  const shownBots = Math.max(0, Math.min(bots, capacity - players.length))

  // Both act on the number on screen, not on the stored ask — the screen shows
  // no control for the ask, so a click that changed only it would look broken.
  const addBot = () => setBots(shownBots + 1)
  const removeBot = () => setBots(shownBots - 1)

  // A row is a player, a bot (carrying its number), or an empty seat.
  const slots: (Player | { bot: number } | null)[] = [
    ...players,
    ...Array.from({ length: shownBots }, (_, i) => ({ bot: i + 1 })),
  ]
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
      <HudBackground tone={bgTone} className={styles.bgLayer} />
      <header className={styles.head}>
        <div>
          <div className={styles.titleRow}>
            <ReleaseLogo className={styles.headLogo} blink={false} variant={lang} />
            <span className={styles.headDivider} />
            <h1 className={styles.title}>{copy.title}</h1>
            {/* the way out of the lobby, one place for everyone: the host
                disbands it, anyone else leaves it — each behind a confirm */}
            {isHost ? (
              <Button variant="dangerGhost" onClick={() => setDisbandOpen(true)}>
                {copy.disband}
              </Button>
            ) : (
              <Button variant="dangerGhost" onClick={() => setLeaveOpen(true)}>
                {copy.leave}
              </Button>
            )}
          </div>
          <p className={styles.sub}>{copy.subtitle}</p>
        </div>
        {/* the room between the two sides of the header is the mini-game's */}
        <BugRunner label={copy.bugRunner} className={styles.runner} />
        <div className={styles.headRight}>
          <LobbyCode code={code} link={shareLink} copy={codeCopy} />
          <LangSwitcher value={lang} onChange={setLang} label={copy.language} />
        </div>
      </header>

      <div className={`${styles.grid} ${chat == null ? '' : styles.gridChat}`}>
        {/* слева — режимы */}
        <section className={styles.modes}>
          <h2 className={styles.h}>
            {copy.modes}
            {!isHost && <span className={styles.lockTag}>{copy.modesLockedHint}</span>}
            <Button variant="tech" className={styles.rulesBtn} onClick={() => setRulesOpen(true)}>
              {copy.rules}
            </Button>
          </h2>
          <ScrollArea className={styles.modeList} contentClassName={styles.modeListFlow}>
            <GameSettings setup={setup} onChange={setMode} readOnly={!isHost} copy={modesCopy} />
          </ScrollArea>
        </section>

        {/* справа — игроки, зрители, управление лобби */}
        <section className={styles.players}>
          <ScrollArea className={styles.scrollArea}>
            <h2 className={styles.h}>
              {copy.players}
              <span className={styles.count}>
                {/* The count describes the table that will be dealt: people and the bots
                    that fit, matching the slots shown below. With 4 players in a 5-seat
                    table, it reads 5 / 5 (one bot), not 4 / 5. */}
                {players.length + shownBots} / {capacity}
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
                p && 'id' in p ? (
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
                ) : p && 'bot' in p ? (
                  <PlayerSlot
                    key={`bot-${p.bot}`}
                    name={copy.botName.replace('{{n}}', String(p.bot))}
                    badge={
                      <Badge tone="muted" size="sm" outlined>
                        {copy.roleBot}
                      </Badge>
                    }
                    status={<Badge tone="success">{copy.ready}</Badge>}
                    dropdownLabel={copy.actions}
                    dropdown={isHost ? [{ label: copy.removeBot, onClick: removeBot }] : undefined}
                  />
                ) : (
                  <EmptySlot
                    // biome-ignore lint/suspicious/noArrayIndexKey: пустые слоты — позиционные заглушки без стабильного id
                    key={`empty-${i}`}
                    action={
                      isHost ? (
                        <Button variant="pill" onClick={addBot}>
                          {copy.addBot}
                        </Button>
                      ) : undefined
                    }
                  >
                    {copy.freeSlot}
                  </EmptySlot>
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
          </ScrollArea>

          {/* [ READY ] repeats the toggle in my own row — same action, same state,
              green while on; the host's [ START ] goes under it */}
          <div className={styles.actions}>
            {me && (
              <Button aria-pressed={me.ready} onClick={() => toggleReady(me.id)}>
                {copy.ready}
              </Button>
            )}
            {isHost && <Button disabled={!canStart}>{copy.start}</Button>}
          </div>
        </section>

        {/* самая правая — чат, если его дали */}
        {chat != null && (
          <section className={styles.chatCol}>
            <h2 className={styles.h}>{copy.chat}</h2>
            {chat}
          </section>
        )}
      </div>

      <Modal open={rulesOpen} onClose={() => setRulesOpen(false)} title={copy.rulesTitle} wide>
        <Rules copy={rulesCopy} />
      </Modal>

      <Modal open={disbandOpen} onClose={() => setDisbandOpen(false)} title={copy.disbandTitle}>
        <p className={styles.confirmText}>{copy.disbandText}</p>
        <div className={styles.confirmActions}>
          <Button variant="tech" onClick={() => setDisbandOpen(false)}>
            {copy.cancel}
          </Button>
          <Button variant="danger" onClick={() => setDisbandOpen(false)}>
            {copy.disband}
          </Button>
        </div>
      </Modal>

      <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)} title={copy.leaveTitle}>
        <p className={styles.confirmText}>{copy.leaveText}</p>
        <div className={styles.confirmActions}>
          <Button variant="tech" onClick={() => setLeaveOpen(false)}>
            {copy.cancel}
          </Button>
          <Button variant="danger" onClick={() => setLeaveOpen(false)}>
            {copy.leave}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
