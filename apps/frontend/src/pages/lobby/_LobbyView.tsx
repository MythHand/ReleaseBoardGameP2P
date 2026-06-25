import { useTranslation } from '@release/translation'
import {
  Avatar,
  Badge,
  type BadgeTone,
  Button,
  GAME_MODES,
  Input,
  MODES_COPY_EN,
  MODES_COPY_RU,
  Modal,
  ModeSelect,
  Slider,
} from '@release/ui'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '~/app/providers/SessionProvider'
import type { Role } from '~/entities/lobby'
import { useStartGame } from '~/features/start-game/useStartGame'

const ROLE_TONE: Record<Role, BadgeTone> = { host: 'success', player: 'info', guest: 'muted' }

export default function LobbyView() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const startGame = useStartGame()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [disbandOpen, setDisbandOpen] = useState(false)

  const state = session.state
  if (!state) return null

  const modesCopy = i18n.language.startsWith('en') ? MODES_COPY_EN : MODES_COPY_RU

  const players = Object.values(state.peers).filter((p) => p.role === 'host' || p.role === 'player')
  const spectators = Object.values(state.peers).filter((p) => p.role === 'guest')
  const self = state.peers[state.selfId]
  const playerSlots = players.length

  const shareUrl = session.roomCode
    ? `${window.location.origin}${import.meta.env.BASE_URL}lobby/${session.roomCode}`
    : ''

  const copyShareLink = () => {
    navigator.clipboard?.writeText(shareUrl)
    setCopied(true)
  }

  const roleLabel = (role: Role) =>
    role === 'host'
      ? t('lobby.roleHost')
      : role === 'player'
        ? t('lobby.rolePlayer')
        : t('lobby.roleGuest')

  const back = () => navigate('/start')
  const drop = () => {
    session.leaveSession()
    navigate('/start')
  }

  const onDisbandConfirm = () => {
    setDisbandOpen(false)
    session.disband()
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-16 lg:flex-row">
      {/* Left column — game modes */}
      <section className="flex flex-col gap-4 lg:w-96">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-fg text-sm tracking-base">{t('lobby.modes')}</h2>
          {!session.isHost && (
            <span className="text-fg/40 text-xs">{t('lobby.modesLockedHint')}</span>
          )}
        </div>
        {GAME_MODES.map((m) => {
          const mc = modesCopy[m.key]
          return (
            <ModeSelect
              key={m.key}
              title={mc?.title ?? ''}
              options={m.options.map((o) => ({
                value: o.value,
                label: o.label,
                desc: mc?.options[o.value] ?? '',
              }))}
              value={state.setup[m.key] ?? ''}
              readOnly={!session.isHost}
              onChange={(v) => session.setSetup({ ...state.setup, [m.key]: v })}
            />
          )
        })}
      </section>

      {/* Right column — roster */}
      <section className="flex flex-1 flex-col gap-5 rounded-2xl border border-fg/10 bg-surface-1 p-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="font-semibold text-fg/70 text-xs tracking-base">{t('lobby.roomCode')}</p>
            <p className="font-bold text-2xl text-brand-green tracking-widest">
              {session.roomCode}
            </p>
          </div>
          <Badge tone={ROLE_TONE[self?.role ?? 'guest']} outlined>
            {roleLabel(self?.role ?? 'guest')}
          </Badge>
        </div>

        <Input
          label={t('lobby.shareLink')}
          value={shareUrl}
          readOnly
          onFocus={(e) => e.target.select()}
          trailing={
            <Button variant="tech" onClick={copyShareLink}>
              {copied ? t('lobby.copied') : t('lobby.copy')}
            </Button>
          }
        />

        {session.isHost && (
          <Slider
            label={t('lobby.maxPlayers')}
            value={state.maxPlayers}
            min={Math.max(2, playerSlots)}
            max={6}
            onChange={session.setMaxPlayers}
          />
        )}

        <div className="flex flex-col gap-2">
          <p className="font-semibold text-fg/70 text-xs tracking-base">
            {t('lobby.players')} ({players.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {players.map((peer) => (
              <li
                key={peer.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2"
              >
                <span className="flex items-center gap-2">
                  <Avatar name={peer.name} size={28} />
                  <span className="font-medium text-fg">{peer.name}</span>
                  {peer.id === state.selfId && (
                    <span className="text-fg/40 text-xs">({t('lobby.you')})</span>
                  )}
                  <Badge tone={ROLE_TONE[peer.role]}>{roleLabel(peer.role)}</Badge>
                </span>
                <span className="flex items-center gap-3">
                  <Badge tone={peer.ready ? 'success' : 'muted'}>
                    {peer.ready ? t('lobby.ready') : t('lobby.waiting')}
                  </Badge>
                  {session.isHost && peer.role !== 'host' && (
                    <Button variant="tech" onClick={() => session.kick(peer.id)}>
                      {t('lobby.kick')}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {spectators.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-fg/70 text-xs tracking-base">
              {t('lobby.roleGuest')} ({spectators.length})
            </p>
            <ul className="flex flex-col gap-1.5">
              {spectators.map((peer) => (
                <li
                  key={peer.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2"
                >
                  <span className="flex items-center gap-2">
                    <Avatar name={peer.name} size={28} />
                    <span className="font-medium text-fg">{peer.name}</span>
                    {peer.id === state.selfId && (
                      <span className="text-fg/40 text-xs">({t('lobby.you')})</span>
                    )}
                    <Badge tone="muted">{t('lobby.roleGuest')}</Badge>
                  </span>
                  {session.isHost && (
                    <Button variant="tech" onClick={() => session.kick(peer.id)}>
                      {t('lobby.kick')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {!session.isHost && (
            <Button variant="tech" onClick={() => session.ready()} disabled={self?.ready}>
              {t('lobby.ready')}
            </Button>
          )}
          {session.isHost && (
            <Button
              onClick={startGame}
              disabled={!session.canStart}
              title={session.canStart ? undefined : t('lobby.startHint')}
            >
              {t('lobby.start')}
            </Button>
          )}
          <Button variant="tech" className="ml-auto" onClick={back}>
            {t('lobby.back')}
          </Button>
          <Button variant="danger" onClick={drop}>
            {t('lobby.leave')}
          </Button>
          {session.isHost && (
            <Button variant="danger" onClick={() => setDisbandOpen(true)}>
              {t('lobby.disband')}
            </Button>
          )}
        </div>
      </section>

      <Modal
        open={disbandOpen}
        onClose={() => setDisbandOpen(false)}
        title={t('lobby.disbandTitle')}
      >
        <p className="text-fg/80 text-sm">{t('lobby.disbandConfirm')}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="tech" onClick={() => setDisbandOpen(false)}>
            {t('start.close')}
          </Button>
          <Button variant="danger" onClick={onDisbandConfirm}>
            {t('lobby.disband')}
          </Button>
        </div>
      </Modal>
    </main>
  )
}
