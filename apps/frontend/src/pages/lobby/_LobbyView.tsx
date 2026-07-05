import { useTranslation } from '@release/translation'
import {
  Avatar,
  Badge,
  Button,
  GameSettings,
  MODES_COPY_EN,
  MODES_COPY_RU,
  Modal,
  Slider,
  Toggle,
} from '@release/ui'
import { useEffect, useState } from 'react'
import { useSession } from '~/app/providers/SessionProvider'
import { useNavigate } from '~/app/router'
import { useStartGame } from '~/features/start-game/useStartGame'
import type { PeerInfo } from '~/network/types'
import { BASE_URL } from '~/shared/config'
import AppLogo from '~/shared/ui/AppLogo'
import styles from './_LobbyView.module.css'

interface MenuItemDef {
  label: string
  danger?: boolean
  onClick: () => void
}

export default function LobbyView() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const startGame = useStartGame()
  const navigate = useNavigate()

  const [copied, setCopied] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [disbandOpen, setDisbandOpen] = useState(false)

  // Close the kebab menu on any outside click.
  useEffect(() => {
    if (menuFor == null) return
    const onDoc = () => setMenuFor(null)
    window.addEventListener('click', onDoc)
    return () => window.removeEventListener('click', onDoc)
  }, [menuFor])

  const state = session.state
  if (!state) return null

  const isEn = i18n.language.startsWith('en')
  const modesCopy = isEn ? MODES_COPY_EN : MODES_COPY_RU

  const isHost = session.isHost
  const players = Object.values(state.peers).filter((p) => p.role === 'host' || p.role === 'player')
  const spectators = Object.values(state.peers).filter((p) => p.role === 'guest')
  const capacity = state.maxPlayers
  const minCapacity = Math.max(2, players.length)

  const shareUrl = session.roomCode
    ? `${window.location.origin}${BASE_URL}lobby/${session.roomCode}`
    : ''

  const copyLink = () => {
    navigator.clipboard?.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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

  const openMenu = (id: string) => setMenuFor((cur) => (cur === id ? null : id))

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
          {p.ready ? t('lobby.ready') : t('lobby.notReady')}
        </Toggle>
      )
    }
    return (
      <Badge tone={p.ready ? 'success' : 'muted'}>
        {p.ready ? t('lobby.ready') : t('lobby.waiting')}
      </Badge>
    )
  }

  const renderMenu = (id: string, items: MenuItemDef[]) => (
    <div className={styles.kebabWrap}>
      <button
        type="button"
        className={styles.kebabBtn}
        aria-label={t('lobby.kick')}
        onClick={(e) => {
          e.stopPropagation()
          openMenu(id)
        }}
      >
        ⋯
      </button>
      {menuFor === id && (
        <div className={styles.kebabMenu}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              className={`${styles.kebabItem} ${it.danger ? styles.kebabDanger : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                it.onClick()
                setMenuFor(null)
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className={styles.lobby}>
      <header className={styles.head}>
        <div>
          <div className={styles.titleRow}>
            <AppLogo className={styles.headLogo} blink={false} />
            <span className={styles.headDivider} />
            <h1 className={styles.title}>{t('lobby.title')}</h1>
            {isHost && (
              <Button variant="dangerGhost" onClick={() => setDisbandOpen(true)}>
                {t('lobby.disband')}
              </Button>
            )}
          </div>
          <p className={styles.sub}>{t('lobby.subtitle')}</p>
        </div>
        <div className={styles.codeBox}>
          <span className={styles.codeLabel}>{t('lobby.code')}</span>
          <div className={styles.codeRow}>
            <span className={styles.codeValue}>{session.roomCode}</span>
            <button className={styles.copyBtn} type="button" onClick={copyLink}>
              {copied ? t('lobby.copied') : t('lobby.copy')}
            </button>
          </div>
        </div>
      </header>

      <div className={styles.grid}>
        {/* Left — match modes */}
        <section className={styles.modes}>
          <h2 className={styles.h}>
            {t('lobby.modes')}
            {!isHost && <span className={styles.lockTag}>{t('lobby.modesLockedHint')}</span>}
          </h2>
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
            <h2 className={styles.h}>
              {t('lobby.players')}
              <span className={styles.count}>
                {players.length} / {capacity}
              </span>
            </h2>

            {isHost && (
              <Slider
                className={styles.capRow}
                label={t('lobby.capacity')}
                value={capacity}
                min={minCapacity}
                max={6}
                onChange={session.setMaxPlayers}
              />
            )}

            <ul className={styles.list}>
              {slots.map(({ key, peer: p }) =>
                p ? (
                  <li
                    key={key}
                    className={`${styles.slot} ${p.id === state.selfId ? styles.slotMe : ''}`}
                  >
                    <Avatar name={p.name} size={34} />
                    <span className={styles.name}>
                      {p.name}
                      {p.id === state.selfId && (
                        <span className={styles.you}> ({t('lobby.you')})</span>
                      )}
                    </span>
                    {p.role === 'host' && (
                      <Badge tone="success" size="sm" outlined>
                        {t('lobby.roleHost')}
                      </Badge>
                    )}

                    <div className={styles.rowEnd}>
                      {renderStatus(p)}
                      {isHost &&
                        p.id !== state.selfId &&
                        renderMenu(p.id, [
                          {
                            label: t('lobby.kick'),
                            danger: true,
                            onClick: () => session.kick(p.id),
                          },
                        ])}
                    </div>
                  </li>
                ) : (
                  <li key={key} className={styles.slotEmpty}>
                    {t('lobby.freeSlot')}
                  </li>
                ),
              )}
            </ul>

            <h2 className={`${styles.h} ${styles.hSpectators}`}>
              {t('lobby.spectators')}
              <span className={styles.count}>{spectators.length}</span>
            </h2>

            <ul className={styles.list}>
              {spectators.map((s) => (
                <li key={s.id} className={styles.slot}>
                  <Avatar name={s.name} size={34} />
                  <span className={styles.name}>
                    {s.name}
                    {s.id === state.selfId && (
                      <span className={styles.you}> ({t('lobby.you')})</span>
                    )}
                  </span>
                  <div className={styles.rowEnd}>
                    <Badge tone="muted">{t('lobby.roleGuest')}</Badge>
                    {isHost &&
                      renderMenu(s.id, [
                        { label: t('lobby.kick'), danger: true, onClick: () => session.kick(s.id) },
                      ])}
                  </div>
                </li>
              ))}
              {spectators.length === 0 && (
                <li className={styles.slotEmpty}>{t('lobby.noSpectators')}</li>
              )}
            </ul>
          </div>

          <div className={styles.actions}>
            {isHost ? (
              <Button disabled={!session.canStart} onClick={startGame}>
                {t('lobby.start')}
              </Button>
            ) : (
              <Button onClick={leave}>{t('lobby.leave')}</Button>
            )}
          </div>
        </section>
      </div>

      <Modal
        open={disbandOpen}
        onClose={() => setDisbandOpen(false)}
        title={t('lobby.disbandTitle')}
      >
        <p className={styles.confirmText}>{t('lobby.disbandConfirm')}</p>
        <div className={styles.confirmActions}>
          <Button variant="tech" onClick={() => setDisbandOpen(false)}>
            {t('start.close')}
          </Button>
          <Button variant="danger" onClick={onDisbandConfirm}>
            {t('lobby.disband')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
