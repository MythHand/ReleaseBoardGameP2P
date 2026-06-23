import { useTranslation } from '@release/translation'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '~/app/providers/SessionProvider'
import type { Role } from '~/entities/lobby'
import { useStartGame } from '~/features/start-game/useStartGame'
import {
  card,
  dangerBtn,
  field,
  ghostBtn,
  input,
  label,
  MAX_PLAYER_OPTIONS,
  primaryBtn,
  Shell,
} from './_ui'

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
  const shareUrl = session.roomCode ? `${window.location.origin}/lobby/${session.roomCode}` : ''
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
          <span className="text-fg/50 text-sm">{roleLabel(self?.role ?? 'guest')}</span>
        </div>

        <label className={field}>
          <span className={label}>{t('lobby.shareLink')}</span>
          <div className="flex gap-2">
            <input
              className={`${input} flex-1`}
              readOnly
              value={shareUrl}
              onFocus={(e) => e.target.select()}
            />
            <button type="button" className={ghostBtn} onClick={copyShareLink}>
              {copied ? t('lobby.copied') : t('lobby.copy')}
            </button>
          </div>
        </label>

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
                  <span className="font-medium text-fg">{peer.name}</span>
                  {peer.id === state.selfId && (
                    <span className="text-fg/40 text-xs">({t('lobby.you')})</span>
                  )}
                  <span className="text-fg/40 text-xs">{roleLabel(peer.role)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className={peer.ready ? 'text-brand-green text-sm' : 'text-fg/40 text-sm'}>
                    {peer.ready
                      ? `${t('lobby.readyMark')} ${t('lobby.ready')}`
                      : t('lobby.waiting')}
                  </span>
                  {session.isHost && peer.role !== 'host' && (
                    <button
                      type="button"
                      className={ghostBtn}
                      onClick={() => session.kick(peer.id)}
                    >
                      {t('lobby.kick')}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={ghostBtn}
            onClick={() => session.ready()}
            disabled={self?.ready}
          >
            {t('lobby.ready')}
          </button>
          {session.isHost && (
            <button
              type="button"
              className={primaryBtn}
              onClick={() => startGame()}
              disabled={!session.canStart}
              title={session.canStart ? undefined : t('lobby.startHint')}
            >
              {t('lobby.start')}
            </button>
          )}
          <button type="button" className={`${ghostBtn} ml-auto`} onClick={back}>
            {t('lobby.back')}
          </button>
          <button type="button" className={dangerBtn} onClick={drop}>
            {t('lobby.drop')}
          </button>
        </div>
      </div>
    </Shell>
  )
}
