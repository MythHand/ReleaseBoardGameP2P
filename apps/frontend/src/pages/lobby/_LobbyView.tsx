import { useTranslation } from '@release/translation'
import {
  Badge,
  Button,
  CopyButton,
  EmptySlot,
  GameSettings,
  HudBackground,
  LangSwitcher,
  Modal,
  PlayerSlot,
  Slider,
  Toggle,
  Typography,
} from '@release/ui'
import { useEffect, useState } from 'react'
import { useSession } from '~/app/providers/SessionProvider'
import { useNavigate } from '~/app/router'
import { useStartGame } from '~/features/start-game/useStartGame'
import type { PeerInfo } from '~/network/types'
import { BASE_URL } from '~/shared/config'
import AppLogo from '~/shared/ui/AppLogo'
import { useModalRoute } from '~/shared/ui/ModalRouter'
import styles from './_LobbyView.module.css'

export default function LobbyView() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const startGame = useStartGame()
  const navigate = useNavigate()
  // Rules reuse the app-wide `?modal=` router rather than a second local modal,
  // so the lobby and the start screen open the very same rules content.
  const openModal = useModalRoute()

  const [disbandOpen, setDisbandOpen] = useState(false)

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
  const capacity = state.maxPlayers
  const minCapacity = Math.max(2, players.length)

  // The invite link — what a host actually sends someone. Opening it lands on
  // the invite screen with the code already filled in.
  const shareUrl = session.roomCode
    ? `${window.location.origin}${BASE_URL}lobby/${session.roomCode}`
    : ''

  const setMode = (key: string, value: string) => session.setSetup({ ...state.setup, [key]: value })

  const leave = () => {
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
  const slots: { key: string; peer: PeerInfo | null }[] = [
    ...players.map((p) => ({ key: p.id, peer: p })),
    ...Array.from({ length: Math.max(0, capacity - players.length) }, (_, j) => ({
      key: `empty-${players.length + j}`,
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
            {isHost && (
              <Button variant="dangerGhost" onClick={() => setDisbandOpen(true)}>
                {t('lobbyScreen.disband')}
              </Button>
            )}
          </div>
          <Typography base="label" tk="tk-14" as="p" className={styles.sub}>
            {t('lobbyScreen.subtitle')}
          </Typography>
        </div>
        <div className={styles.headRight}>
          <div className={styles.codeBox}>
            <Typography base="label-sm" tk="tk-16" as="span" className={styles.codeLabel}>
              {t('lobbyCode.label')}
            </Typography>
            <div className={styles.codeRow}>
              {/* Copies the invite link, not the bare code — that link is what
                  opens the invite screen with the code already filled in. */}
              <CopyButton
                variant="tech"
                copyValue={shareUrl}
                copiedChildren={t('lobbyCode.copied')}
              >
                {t('lobbyCode.copy')}
              </CopyButton>
              <Typography variant="code" className={styles.codeValue}>
                {session.roomCode}
              </Typography>
            </div>
          </div>
          <LangSwitcher
            value={i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'}
            onChange={(lang) => i18n.changeLanguage(lang)}
            label={t('lobbyScreen.language')}
          />
        </div>
      </header>

      <div className={styles.grid}>
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
                {players.length} / {capacity}
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
              {slots.map(({ key, peer: p }) =>
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
                ) : (
                  <EmptySlot key={key}>{t('lobbyScreen.freeSlot')}</EmptySlot>
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

          <div className={styles.actions}>
            {isHost ? (
              <Button disabled={!session.canStart} onClick={startGame}>
                {t('lobbyScreen.start')}
              </Button>
            ) : (
              <Button onClick={leave}>{t('lobbyScreen.leave')}</Button>
            )}
          </div>
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
    </div>
  )
}
