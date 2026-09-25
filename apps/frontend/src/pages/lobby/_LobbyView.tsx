import { useTranslation } from '@release/translation'
import {
  Badge,
  BugRunner,
  Button,
  EmptySlot,
  GameSettings,
  HudBackground,
  LangSwitcher,
  LobbyCode,
  Modal,
  PlayerSlot,
  Slider,
  Toggle,
  Typography,
} from '@release/ui'
import { useEffect, useState } from 'react'
import { useSession } from '~/app/providers/SessionProvider'
import { useNavigate } from '~/app/router'
import { RoomChat, useRoomChatView } from '~/features/chat/RoomChat'
import { useStartGame } from '~/features/start-game/useStartGame'
import { effectiveBots } from '~/network'
import type { PeerInfo } from '~/network/types'
import { BASE_URL } from '~/shared/config'
import AppLogo from '~/shared/ui/AppLogo'
import { useModalRoute } from '~/shared/ui/ModalRouter'
import styles from './_LobbyView.module.css'

export default function LobbyView() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const chat = useRoomChatView()
  const startGame = useStartGame()
  const navigate = useNavigate()
  // Rules reuse the app-wide `?modal=` router rather than a second local modal,
  // so the lobby and the start screen open the very same rules content.
  const openModal = useModalRoute()

  const [disbandOpen, setDisbandOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)

  // Where this peer is, for everyone else's results table.
  const { setWhere } = session
  useEffect(() => {
    setWhere('lobby')
  }, [setWhere])

  const state = session.state
  if (!state) return null

  // mode copy comes from the central catalog (namespace `gameModes`) via i18next
  const modesCopy = t('gameModes', { returnObjects: true })

  const isHost = session.isHost
  const players = Object.values(state.peers).filter((p) => p.role === 'host' || p.role === 'player')
  const spectators = Object.values(state.peers).filter((p) => p.role === 'guest')
  // me, when I hold a seat — a spectator has no readiness to give
  const me = players.find((p) => p.id === state.selfId)
  const capacity = state.maxPlayers
  const minCapacity = Math.max(2, players.length)
  // What the table can actually give right now — capped by the free seats — as
  // distinct from `state.bots`, the raw number the host asked for. They differ
  // whenever people fill or leave seats.
  const bots = effectiveBots(state)

  // The invite link — what a host actually sends someone. Opening it lands on
  // the invite screen with the code already filled in.
  const shareUrl = session.roomCode
    ? `${window.location.origin}${BASE_URL}lobby/${session.roomCode}`
    : ''

  const setMode = (key: string, value: string) => session.setSetup({ ...state.setup, [key]: value })

  // Both act on the number the host can SEE (`bots`), not on the raw ask stored
  // in `state.bots`. With the slider gone there is no control showing the ask,
  // so letting the two drift would make a click do nothing visible: a host who
  // once asked for five and now has one free seat would press [remove] and
  // watch the row stay. The ceiling still does its job between clicks — a bot
  // yields its seat to a joiner and comes back when they leave.
  const addBot = () => session.setBots(bots + 1)
  const removeBot = () => session.setBots(bots - 1)

  const onLeaveConfirm = () => {
    setLeaveOpen(false)
    session.leaveSession()
    navigate('/start')
  }
  const onDisbandConfirm = () => {
    setDisbandOpen(false)
    session.disband()
    navigate('/start')
  }

  // Fill the player column with empty slots up to the capacity. Each slot
  // carries a stable key — empty slots are keyed by their fixed position rather
  // than the raw render index, so React identity stays put as players come/go.
  const slots: { key: string; peer: PeerInfo | null; bot?: number }[] = [
    ...players.map((p) => ({ key: p.id, peer: p })),
    ...Array.from({ length: bots }, (_, i) => ({ key: `bot-${i}`, peer: null, bot: i + 1 })),
    ...Array.from({ length: Math.max(0, capacity - players.length - bots) }, (_, j) => ({
      key: `empty-${players.length + bots + j}`,
      peer: null as PeerInfo | null,
    })),
  ]

  const renderStatus = (p: PeerInfo) => {
    if (p.id === state.selfId) {
      return (
        <Toggle on={p.ready} onChange={() => session.ready()}>
          {p.ready ? t('lobbyScreen.ready') : t('lobbyScreen.notReady')}
        </Toggle>
      )
    }
    return (
      <Badge tone={p.ready ? 'success' : 'muted'}>
        {p.ready ? t('lobbyScreen.ready') : t('lobbyScreen.waiting')}
      </Badge>
    )
  }

  // Kick is the only moderation action the protocol backs today — role changes
  // (make spectator/player) have no wire message, so the menu carries just this.
  const kickItems = (id: string) => [
    { label: t('lobbyScreen.kick'), danger: true, onClick: () => session.kick(id) },
  ]

  return (
    <div className={styles.lobby}>
      {/* Green once the game can actually start — the tone and the Start button
          are driven by the same canStart rule, so they never disagree. */}
      <HudBackground tone={session.canStart ? 'positive' : 'neutral'} className={styles.bgLayer} />

      <header className={styles.head}>
        <div>
          <div className={styles.titleRow}>
            <AppLogo className={styles.headLogo} blink={false} />
            <span className={styles.headDivider} />
            <Typography variant="pageTitle" className={styles.title}>
              {t('lobbyScreen.title')}
            </Typography>
            {/* the way out of the lobby, one place for everyone: the host
                disbands it, anyone else leaves it — each behind a confirm */}
            {isHost ? (
              <Button variant="dangerGhost" onClick={() => setDisbandOpen(true)}>
                {t('lobbyScreen.disband')}
              </Button>
            ) : (
              <Button variant="dangerGhost" onClick={() => setLeaveOpen(true)}>
                {t('lobbyScreen.leave')}
              </Button>
            )}
          </div>
          <Typography base="label" tk="tk-14" as="p" className={styles.sub}>
            {t('lobbyScreen.subtitle')}
          </Typography>
        </div>
        {/* the room between the two sides of the header is the mini-game's */}
        <BugRunner label={t('lobbyScreen.bugRunner')} className={styles.runner} />
        <div className={styles.headRight}>
          <LobbyCode
            code={session.roomCode ?? ''}
            link={shareUrl}
            copy={t('lobbyCode', { returnObjects: true })}
          />
          <LangSwitcher
            value={i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'}
            onChange={(lang) => i18n.changeLanguage(lang)}
            label={t('lobbyScreen.language')}
          />
        </div>
      </header>

      <div className={`${styles.grid} ${styles.gridChat}`}>
        {/* Left — match modes */}
        <section className={styles.modes}>
          <Typography variant="sectionTitle" className={styles.h}>
            {t('lobbyScreen.modes')}
            {!isHost && (
              <Typography base="mono-xs" tk="tk-10" as="span" className={styles.lockTag}>
                {t('lobbyScreen.modesLockedHint')}
              </Typography>
            )}
            <Button variant="tech" className={styles.rulesBtn} value="rules" onClick={openModal}>
              {t('lobbyScreen.rules')}
            </Button>
          </Typography>
          <div className={styles.modeList}>
            <GameSettings
              setup={state.setup}
              onChange={setMode}
              readOnly={!isHost}
              copy={modesCopy}
            />
          </div>
        </section>

        {/* Right — players, spectators, lobby controls */}
        <section className={styles.players}>
          <div className={styles.scrollArea}>
            <Typography variant="sectionTitle" className={styles.h}>
              {t('lobbyScreen.players')}
              <Typography base="mono-md" tk="tk-10" as="span" className={styles.count}>
                {players.length + bots} / {capacity}
              </Typography>
            </Typography>

            {isHost && (
              <Slider
                className={styles.capRow}
                label={t('lobbyScreen.capacity')}
                value={capacity}
                min={minCapacity}
                max={6}
                onChange={session.setMaxPlayers}
              />
            )}

            <div className={styles.list}>
              {slots.map(({ key, peer: p, bot }) =>
                p ? (
                  <PlayerSlot
                    key={key}
                    name={p.name}
                    me={p.id === state.selfId}
                    youLabel={t('lobbyScreen.you')}
                    badge={
                      p.role === 'host' ? (
                        <Badge tone="success" size="sm" outlined>
                          {t('lobbyScreen.roleHost')}
                        </Badge>
                      ) : undefined
                    }
                    status={renderStatus(p)}
                    dropdownLabel={t('lobbyScreen.actions')}
                    dropdown={isHost && p.id !== state.selfId ? kickItems(p.id) : undefined}
                  />
                ) : bot ? (
                  // Removal goes through the same ⋯ menu that kicks a person, and
                  // takes the count down by one rather than this particular row:
                  // bots have no identity beyond their number, so the row that
                  // disappears is always the last one.
                  <PlayerSlot
                    key={key}
                    name={t('lobbyScreen.botName', { n: bot })}
                    badge={
                      <Badge tone="muted" size="sm" outlined>
                        {t('lobbyScreen.roleBot')}
                      </Badge>
                    }
                    status={<Badge tone="success">{t('lobbyScreen.ready')}</Badge>}
                    dropdownLabel={t('lobbyScreen.actions')}
                    dropdown={
                      isHost
                        ? [{ label: t('lobbyScreen.removeBot'), onClick: removeBot }]
                        : undefined
                    }
                  />
                ) : (
                  <EmptySlot
                    key={key}
                    action={
                      isHost ? (
                        <Button variant="pill" onClick={addBot}>
                          {t('lobbyScreen.addBot')}
                        </Button>
                      ) : undefined
                    }
                  >
                    {t('lobbyScreen.freeSlot')}
                  </EmptySlot>
                ),
              )}
            </div>

            <Typography variant="sectionTitle" className={`${styles.h} ${styles.hSpectators}`}>
              {t('lobbyScreen.spectators')}
              <Typography base="mono-md" tk="tk-10" as="span" className={styles.count}>
                {spectators.length}
              </Typography>
            </Typography>

            <div className={styles.list}>
              {spectators.map((s) => (
                <PlayerSlot
                  key={s.id}
                  name={s.name}
                  me={s.id === state.selfId}
                  youLabel={t('lobbyScreen.you')}
                  status={<Badge tone="muted">{t('lobbyScreen.roleGuest')}</Badge>}
                  dropdownLabel={t('lobbyScreen.actions')}
                  dropdown={isHost ? kickItems(s.id) : undefined}
                />
              ))}
              {spectators.length === 0 && <EmptySlot>{t('lobbyScreen.noSpectators')}</EmptySlot>}
            </div>
          </div>

          {/* [ READY ] repeats the toggle in my own row — same action, same state,
              green while on; the host's [ START ] goes under it. A spectator has
              no readiness, and leaving lives in the header: nothing here. */}
          <div className={styles.actions}>
            {me && (
              <Button aria-pressed={me.ready} onClick={() => session.ready()}>
                {t('lobbyScreen.ready')}
              </Button>
            )}
            {isHost && (
              <Button disabled={!session.canStart} onClick={startGame}>
                {t('lobbyScreen.start')}
              </Button>
            )}
          </div>
        </section>

        <section className={styles.chatCol}>
          <Typography variant="sectionTitle" className={styles.h}>
            {t('lobbyScreen.chat')}
          </Typography>
          <RoomChat view={chat} />
        </section>
      </div>

      <Modal
        open={disbandOpen}
        onClose={() => setDisbandOpen(false)}
        title={t('lobbyScreen.disbandTitle')}
      >
        <Typography variant="body" className={styles.confirmText}>
          {t('lobbyScreen.disbandText')}
        </Typography>
        <div className={styles.confirmActions}>
          <Button variant="tech" onClick={() => setDisbandOpen(false)}>
            {t('lobbyScreen.cancel')}
          </Button>
          <Button variant="danger" onClick={onDisbandConfirm}>
            {t('lobbyScreen.disband')}
          </Button>
        </div>
      </Modal>

      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={t('lobbyScreen.leaveTitle')}
      >
        <Typography variant="body" className={styles.confirmText}>
          {t('lobbyScreen.leaveText')}
        </Typography>
        <div className={styles.confirmActions}>
          <Button variant="tech" onClick={() => setLeaveOpen(false)}>
            {t('lobbyScreen.cancel')}
          </Button>
          <Button variant="danger" onClick={onLeaveConfirm}>
            {t('lobbyScreen.leave')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
