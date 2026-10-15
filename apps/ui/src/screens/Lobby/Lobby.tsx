import { type ReactNode, useState } from 'react'
import { PRESET_AVATARS } from '@/avatars/PresetAvatar'
import BugRunner from '@/blocks/BugRunner'
import GameSettings from '@/blocks/GameSettings'
import LangSwitcher, { type SwitchLang } from '@/blocks/LangSwitcher'
import LobbyCode, { type LobbyCodeCopy } from '@/blocks/LobbyCode'
import PlayerSettings, { type PlayerSettingsCopy } from '@/blocks/PlayerSettings'
import PlayerSlot, { EmptySlot } from '@/blocks/PlayerSlot'
import Rules, { type RulesCopy } from '@/blocks/Rules'
import ReleaseLogo from '@/brand/ReleaseLogo'
import { botNames } from '@/game/botNames'
import { DEFAULT_SETUP, type GameModesCopy, type Setup } from '@/game/modes'
import { MAX_SPECTATORS, spectatorLimitColor } from '@/game/spectatorLimit'
import Badge from '@/primitives/Badge'
import Button from '@/primitives/Button'
import HudBackground, { type HudBackgroundTone } from '@/primitives/HudBackground'
import Modal from '@/primitives/Modal'
import ScrollArea from '@/primitives/ScrollArea'
import Slider from '@/primitives/Slider'
import Toggle from '@/primitives/Toggle'
import styles from './Lobby.module.css'

export interface LobbyPlayer {
  id: number
  name: string
  host: boolean
  ready: boolean
  online: boolean
  // preset avatar id (PRESET_AVATARS)
  avatar?: string
}
export interface LobbySpectator {
  id: number
  name: string
}
type Player = LobbyPlayer
type Spectator = LobbySpectator
interface LobbyProps {
  code?: string
  onCopy?: (text: string) => Promise<boolean>
  initialCapacity?: number
  initialPlayers?: Player[]
  initialSpectators?: Spectator[]
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
  // the player settings modal's content, in both languages — picked by the inner lang
  playerSettingsCopy: { ru: PlayerSettingsCopy; en: PlayerSettingsCopy }
  // чат третьей, самой правой колонкой. Слот, а не данные: экран не знает ни
  // откуда берутся сообщения, ни как они устроены — он только даёт им место.
  // Без слота колонки нет и сетка остаётся из двух, как была.
  chat?: ReactNode
  // Voice chat, in the same column above the text chat: it stands on its own
  // heading's line, after the title. A slot for the same reason as `chat`;
  // either one alone opens the column.
  voice?: ReactNode
  // Who "me" is as a guest in this mock: a player (neo) or a spectator (oracle).
  // The host is always a player.
  meSpectator?: boolean
  // My nickname changed — said once, when the settings modal closes. The chat
  // is a slot this screen does not own, so the consumer posts the line there.
  onRename?: (from: string, to: string) => void
  // Nicknames speaking in the voice chat right now, as I am allowed to see them
  // (on the line, not muted by me) — the consumer decides; a ring on the avatar.
  speaking?: string[]
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
  roleBot: string
  // заголовок колонки чата — сам блок чата своего заголовка не имеет
  chat: string
  // the voice chat's heading in that column — the block has none of its own either
  voiceChat: string
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
  playerSettingsTitle: string
  // the header's mini-game, as a screen reader names it
  bugRunner: string
  cancel: string
}

// ⚠️ Каркас (WIP). Данные — моки. Сетевой/presence-слой придёт от логики;
// здесь только верстка и интерактив, что уже готов.
const MOCK_PLAYERS: Player[] = [
  { id: 1, name: 'dimbo', host: true, ready: true, online: true, avatar: 'release-frontend' },
  { id: 2, name: 'neo', host: false, ready: true, online: true, avatar: 'attack-bug' },
  {
    id: 3,
    name: 'trinity',
    host: false,
    ready: false,
    online: true,
    avatar: 'defense-rubber-ducky',
  },
  { id: 4, name: 'morpheus', host: false, ready: false, online: false, avatar: 'support-sudo' },
]
const MOCK_SPECTATORS: Spectator[] = [
  { id: 101, name: 'oracle' },
  { id: 102, name: 'cypher' },
]

export default function Lobby({
  code = '4F2A-9K',
  onCopy,
  link,
  initialCapacity = 5,
  initialPlayers = MOCK_PLAYERS,
  initialSpectators = MOCK_SPECTATORS,
  role = 'host',
  initialSetup = DEFAULT_SETUP,
  initialLang = 'ru',
  bgTone = 'neutral',
  lobbyCodeCopy,
  gameModesCopy,
  rulesBlockCopy,
  lobbyScreenCopy,
  playerSettingsCopy,
  chat,
  voice,
  meSpectator = false,
  onRename,
  speaking = [],
}: LobbyProps) {
  const isHost = role === 'host'
  const meId = isHost ? 1 : meSpectator ? 101 : 2 // кто «я» в этой сцене (мок)

  const [setup, setSetup] = useState<Setup>(initialSetup)
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [capacity, setCapacity] = useState(initialCapacity)
  const [bots, setBots] = useState(0)
  const [spectators, setSpectators] = useState<Spectator[]>(initialSpectators)
  const [specCapacity, setSpecCapacity] = useState(8)
  const [disbandOpen, setDisbandOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // the nickname as typed in the settings modal — it reaches my row only while
  // nobody else in the room has it
  const [nicknameDraft, setNicknameDraft] = useState('')
  // my nickname when the modal opened — what the chat line says I was
  const [nameAtOpen, setNameAtOpen] = useState('')
  const [lang, setLang] = useState<SwitchLang>(initialLang)

  // наборы текста по языку — экран держит оба и выбирает встроенным свитчером
  const copy = lobbyScreenCopy[lang]
  const modesCopy = gameModesCopy[lang]
  const codeCopy = lobbyCodeCopy[lang]
  // мок ссылки-приглашения: та же форма, что и реальный shareUrl (origin/lobby/<code>)
  const shareLink = link ?? `release.game/lobby/${code}`
  const rulesCopy = rulesBlockCopy[lang]

  const specColor = spectatorLimitColor(specCapacity)

  const setMode = (key: string, value: string) => setSetup((s) => ({ ...s, [key]: value }))
  const me = players.find((p) => p.id === meId)
  // me as a spectator: no avatar, only the nickname to edit
  const meAsSpectator = spectators.find((s) => s.id === meId)
  const myName = me?.name ?? meAsSpectator?.name ?? ''
  const toggleReady = (id: number) =>
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ready: !p.ready } : p)))
  // the player settings modal edits my own row, in whichever list it stands
  const updateMe = (patch: Partial<Player>) =>
    setPlayers((ps) => ps.map((p) => (p.id === meId ? { ...p, ...patch } : p)))
  const renameMe = (name: string) => {
    updateMe({ name })
    setSpectators((ss) => ss.map((s) => (s.id === meId ? { ...s, name } : s)))
  }
  // avatars the other players hold — shown in the modal, but cannot be picked
  const takenAvatars = players.flatMap((p) => (p.id !== meId && p.avatar ? [p.avatar] : []))

  // модерация (host)
  const kick = (id: number) => setPlayers((ps) => ps.filter((p) => p.id !== id))
  const kickSpectator = (id: number) => setSpectators((ss) => ss.filter((s) => s.id !== id))
  const toSpectator = (id: number) => {
    const p = players.find((x) => x.id === id)
    if (!p || p.host || spectators.length >= specCapacity) return
    setPlayers((ps) => ps.filter((x) => x.id !== id))
    setSpectators((ss) => [...ss, { id: p.id, name: p.name }])
  }
  const toPlayer = (id: number) => {
    const s = spectators.find((x) => x.id === id)
    if (!s || players.length >= capacity) return
    // a new player gets a random avatar that no other player holds
    const held = new Set(players.flatMap((p) => (p.avatar ? [p.avatar] : [])))
    const free = PRESET_AVATARS.filter((a) => !held.has(a.id))
    const avatar = free[Math.floor(Math.random() * free.length)]?.id
    setSpectators((ss) => ss.filter((x) => x.id !== id))
    setPlayers((ps) => [
      ...ps,
      { id: s.id, name: s.name, host: false, ready: false, online: true, avatar },
    ])
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
  // The app's own bot names: the frontend seeds them with the host's id, the
  // mock with the room code — any id that stays put gives a stable lineup.
  const seatedBotNames = botNames(code, shownBots)

  // Everyone else in the room — players, bots, spectators — compared without
  // case, so "Neo" and "neo" count as the same nickname.
  const otherNames = new Set(
    [
      ...players.filter((p) => p.id !== meId).map((p) => p.name),
      ...seatedBotNames,
      ...spectators.filter((s) => s.id !== meId).map((s) => s.name),
    ].map((n) => n.toLowerCase()),
  )
  const nicknameTaken = otherNames.has(nicknameDraft.toLowerCase())
  const openSettings = () => {
    setNicknameDraft(myName)
    setNameAtOpen(myName)
    setSettingsOpen(true)
  }
  // An empty field or someone else's nickname never reaches the row: it keeps
  // the last nickname that was allowed.
  const changeNickname = (name: string) => {
    setNicknameDraft(name)
    if (name && !otherNames.has(name.toLowerCase())) renameMe(name)
  }
  const closeSettings = () => {
    setSettingsOpen(false)
    if (myName !== nameAtOpen) onRename?.(nameAtOpen, myName)
  }

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
          <LobbyCode onCopy={onCopy} code={code} link={shareLink} copy={codeCopy} />
          <LangSwitcher value={lang} onChange={setLang} label={copy.language} />
        </div>
      </header>

      <div className={`${styles.grid} ${chat == null && voice == null ? '' : styles.gridChat}`}>
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
                    avatar={p.avatar}
                    speaking={speaking.includes(p.name)}
                    me={p.id === meId}
                    youLabel={copy.you}
                    onEdit={p.id === meId ? openSettings : undefined}
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
                    name={seatedBotNames[p.bot - 1]}
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
                max={MAX_SPECTATORS}
                onChange={(n) => {
                  if (Number.isInteger(n) && n >= 0 && n <= MAX_SPECTATORS) setSpecCapacity(n)
                }}
                color={specColor}
                fill
              />
            )}

            <div className={styles.list}>
              {spectators.map((s) => (
                <PlayerSlot
                  key={s.id}
                  name={s.name}
                  speaking={speaking.includes(s.name)}
                  me={s.id === meId}
                  youLabel={copy.you}
                  onEdit={s.id === meId ? openSettings : undefined}
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

        {/* самая правая — чат, если его дали; голосовой — над ним, своей группой */}
        {(chat != null || voice != null) && (
          <section className={styles.chatCol}>
            {/* the voice chat is one line: its heading, then the chat itself */}
            {voice != null && (
              <div className={styles.voiceLine}>
                <h2 className={`${styles.h} ${styles.hInline}`}>{copy.voiceChat}</h2>
                {voice}
              </div>
            )}
            {chat != null && (
              <>
                <h2 className={styles.h}>{copy.chat}</h2>
                {chat}
              </>
            )}
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

      <Modal
        open={settingsOpen}
        onClose={closeSettings}
        title={copy.playerSettingsTitle}
        // a player picks an avatar too; a spectator has only the nickname
        wide={Boolean(me)}
      >
        <PlayerSettings
          avatars={
            me
              ? {
                  items: PRESET_AVATARS.map((a) => ({ id: a.id, label: a.label[lang] })),
                  selected: me.avatar ?? null,
                  taken: takenAvatars,
                  onChange: (avatar) => updateMe({ avatar }),
                }
              : undefined
          }
          nickname={nicknameDraft}
          onNicknameChange={changeNickname}
          nicknameTaken={nicknameTaken}
          copy={playerSettingsCopy[lang]}
        />
      </Modal>
    </div>
  )
}
