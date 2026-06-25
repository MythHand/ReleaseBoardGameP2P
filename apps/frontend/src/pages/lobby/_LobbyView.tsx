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
    <div className="relative flex">
      <button
        type="button"
        className="flex h-7 w-7 cursor-pointer items-center justify-center border-0 bg-transparent text-[18px] text-white/50 leading-none transition-colors hover:text-white"
        aria-label={t('lobby.kick')}
        onClick={(e) => {
          e.stopPropagation()
          openMenu(id)
        }}
      >
        ⋯
      </button>
      {menuFor === id && (
        <div className="absolute end-0 top-[calc(100%+6px)] z-[5] w-max border border-white/14 bg-[color-mix(in_srgb,var(--surface-1)_96%,#000)] shadow-[0_16px_40px_rgb(0_0_0/50%)]">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              className={`block w-full cursor-pointer whitespace-nowrap border-0 bg-transparent px-[18px] py-[11px] text-start font-[var(--font-text)] text-sm transition-colors ${
                it.danger
                  ? 'text-[#ff6b81] hover:bg-[#ff6b81]/12'
                  : 'text-white/85 hover:bg-white/8 hover:text-white'
              }`}
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
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black px-[clamp(40px,7vw,96px)] py-12 text-white">
      <header className="flex items-start justify-between gap-8 border-white/8 border-b pb-7">
        <div>
          <div className="flex items-center gap-[18px]">
            <AppLogo className="w-24 flex-none" blink={false} />
            <span className="h-[30px] w-px bg-white/20" />
            <h1 className="m-0 font-[var(--font-heading)] text-[30px] tracking-[0.04em]">
              {t('lobby.title')}
            </h1>
            {isHost && (
              <Button variant="danger" onClick={() => setDisbandOpen(true)}>
                {t('lobby.disband')}
              </Button>
            )}
          </div>
          <p className="mt-1.5 mb-0 ml-[133px] font-[var(--font-mono)] text-white/45 text-xs uppercase tracking-[0.14em]">
            {t('lobby.subtitle')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="font-[var(--font-mono)] text-[11px] text-white/45 uppercase tracking-[0.16em]">
            {t('lobby.code')}
          </span>
          <div className="flex items-center gap-[14px]">
            <span className="font-[var(--font-mono)] text-[#8fd9b0] text-[26px] tracking-[0.2em]">
              {session.roomCode}
            </span>
            <button
              className="cursor-pointer border border-white/18 bg-transparent px-3 py-[7px] font-[var(--font-mono)] text-[11px] text-white/70 uppercase tracking-[0.12em] transition-colors hover:border-white/55 hover:text-white"
              type="button"
              onClick={copyLink}
            >
              {copied ? t('lobby.copied') : t('lobby.copy')}
            </button>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] gap-12 py-8">
        {/* Left — match modes */}
        <section className="flex min-h-0 flex-col">
          <h2 className="m-0 mb-5 flex items-baseline gap-3 font-[var(--font-heading)] text-base uppercase tracking-[0.04em]">
            {t('lobby.modes')}
            {!isHost && (
              <span className="font-[var(--font-mono)] text-[11px] text-white/40 normal-case tracking-[0.1em]">
                {t('lobby.modesLockedHint')}
              </span>
            )}
          </h2>
          <div className="flex flex-col gap-[22px] overflow-y-auto pe-2">
            <GameSettings
              setup={state.setup}
              onChange={setMode}
              readOnly={!isHost}
              copy={modesCopy}
            />
          </div>
        </section>

        {/* Right — players, spectators, lobby controls */}
        <section className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pe-2">
            <h2 className="m-0 mb-5 flex items-baseline gap-3 font-[var(--font-heading)] text-base uppercase tracking-[0.04em]">
              {t('lobby.players')}
              <span className="font-[var(--font-mono)] text-[13px] text-white/45 tracking-[0.1em]">
                {players.length} / {capacity}
              </span>
            </h2>

            {isHost && (
              <Slider
                className="mb-[18px]"
                label={t('lobby.capacity')}
                value={capacity}
                min={minCapacity}
                max={6}
                onChange={session.setMaxPlayers}
              />
            )}

            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {slots.map(({ key, peer: p }) =>
                p ? (
                  <li
                    key={key}
                    className={`flex items-center gap-[14px] border bg-white/4 px-4 py-[14px] ${
                      p.id === state.selfId ? 'border-[#8fd9b0]/50' : 'border-white/10'
                    }`}
                  >
                    <Avatar name={p.name} size={34} />
                    <span className="font-[var(--font-text)] text-[15px]">
                      {p.name}
                      {p.id === state.selfId && (
                        <span className="text-[13px] text-white/40"> ({t('lobby.you')})</span>
                      )}
                    </span>
                    {p.role === 'host' && (
                      <Badge tone="success" size="sm" outlined>
                        {t('lobby.roleHost')}
                      </Badge>
                    )}

                    <div className="relative ms-auto flex items-center gap-2.5">
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
                  <li
                    key={key}
                    className="flex items-center gap-[14px] border border-white/10 border-dashed px-4 py-[14px] font-[var(--font-mono)] text-white/30 text-xs uppercase tracking-[0.12em]"
                  >
                    {t('lobby.freeSlot')}
                  </li>
                ),
              )}
            </ul>

            <h2 className="m-0 mt-[30px] mb-5 flex items-baseline gap-3 font-[var(--font-heading)] text-base uppercase tracking-[0.04em]">
              {t('lobby.spectators')}
              <span className="font-[var(--font-mono)] text-[13px] text-white/45 tracking-[0.1em]">
                {spectators.length}
              </span>
            </h2>

            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {spectators.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-[14px] border border-white/10 bg-white/4 px-4 py-[14px]"
                >
                  <Avatar name={s.name} size={34} />
                  <span className="font-[var(--font-text)] text-[15px]">
                    {s.name}
                    {s.id === state.selfId && (
                      <span className="text-[13px] text-white/40"> ({t('lobby.you')})</span>
                    )}
                  </span>
                  <div className="relative ms-auto flex items-center gap-2.5">
                    <Badge tone="muted">{t('lobby.roleGuest')}</Badge>
                    {isHost &&
                      renderMenu(s.id, [
                        { label: t('lobby.kick'), danger: true, onClick: () => session.kick(s.id) },
                      ])}
                  </div>
                </li>
              ))}
              {spectators.length === 0 && (
                <li className="flex items-center gap-[14px] border border-white/10 border-dashed px-4 py-[14px] font-[var(--font-mono)] text-white/30 text-xs uppercase tracking-[0.12em]">
                  {t('lobby.noSpectators')}
                </li>
              )}
            </ul>
          </div>

          <div className="mt-[22px] flex items-center justify-center gap-4 border-white/8 border-t pt-[22px]">
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
        <p className="m-0 font-[var(--font-text)] text-[15px] text-white/75 leading-[1.6]">
          {t('lobby.disbandConfirm')}
        </p>
        <div className="mt-auto flex justify-end gap-[18px]">
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
