import { useTranslation } from '@release/translation'
import { Avatar, Badge, type BadgeTone, Button, Input } from '@release/ui'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '~/app/providers/SessionProvider'
import type { Role } from '~/entities/lobby'
import { useStartGame } from '~/features/start-game/useStartGame'
import { card, field, input, label, MAX_PLAYER_OPTIONS, Shell } from './_ui'

const ROLE_TONE: Record<Role, BadgeTone> = { host: 'success', player: 'info', guest: 'muted' }

// The live-session view, shared by host and guest once a room exists: room code,
// share link, roster, and ready/kick/start controls. Rendered by _LobbyFlow only
// when the session is `in-lobby`, so `session.state` is present.
export default function SessionView() {
  const { t } = useTranslation()
  const session = useSession()
  const startGame = useStartGame()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)

  const state = session.state
  if (!state) return null

  const peers = Object.values(state.peers)
  const self = state.peers[state.selfId]
  // Include the Vite base path (import.meta.env.BASE_URL, e.g. "/ReleaseBoardGameP2P/"
  // on Pages, "/" in dev) so the invite link resolves under the deployed sub-path
  // instead of the domain root. BASE_URL always ends with a slash.
  const shareUrl = session.roomCode
    ? `${window.location.origin}${import.meta.env.BASE_URL}lobby/${session.roomCode}`
    : ''
  const copyShareLink = () => {
    navigator.clipboard?.writeText(shareUrl)
    setCopied(true)
  }
  // Back keeps the session alive (resume later via the re-entry Continue prompt);
  // Drop tears it down. Both return to the chooser.
  const back = () => navigate('/start')
  const drop = () => {
    session.leaveSession()
    navigate('/start')
  }

  const roleLabel = (role: Role) =>
    role === 'host'
      ? t('lobby.roleHost')
      : role === 'player'
        ? t('lobby.rolePlayer')
        : t('lobby.roleGuest')

  return (
    <Shell>
      <div className={`${card} flex flex-col gap-5`}>
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className={label}>{t('lobby.roomCode')}</p>
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
          <label className={field}>
            <span className={label}>{t('lobby.maxPlayers')}</span>
            <select
              className={input}
              value={state.maxPlayers}
              onChange={(e) => session.setMaxPlayers(Number(e.target.value))}
            >
              {MAX_PLAYER_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex flex-col gap-2">
          <p className={label}>
            {t('lobby.players')} ({peers.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {peers.map((peer) => (
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

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="tech" onClick={() => session.ready()} disabled={self?.ready}>
            {t('lobby.ready')}
          </Button>
          {session.isHost && (
            <Button
              onClick={() => startGame()}
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
            {t('lobby.drop')}
          </Button>
        </div>
      </div>
    </Shell>
  )
}
