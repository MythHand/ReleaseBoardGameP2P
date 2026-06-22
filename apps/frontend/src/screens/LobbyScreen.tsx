import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Role } from '../network'
import { useLobby } from '../network'

function roleLabel(role: Role, t: TFunction): string {
  if (role === 'host') return t('lobby.roleHost')
  if (role === 'player') return t('lobby.rolePlayer')
  return t('lobby.roleGuest')
}

export default function LobbyScreen() {
  const { t } = useTranslation()
  const lobby = useLobby()
  const [name, setName] = useState('')
  const [maxPlayers, setMax] = useState(4)
  const roomParam = new URLSearchParams(window.location.search).get('room')

  if (lobby.status === 'kicked') {
    return <p className="p-8 text-center text-lg">{t('lobby.kickedMessage')}</p>
  }

  if (lobby.status === 'idle') {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 p-8">
        {/* createTitle is shown for host entry; joinTitle shown when ?room= param present */}
        <h1 className="font-bold text-xl">
          {roomParam ? t('lobby.joinTitle') : t('lobby.createTitle')}
        </h1>
        <input
          className="rounded border border-fg/20 bg-surface-1 px-3 py-2"
          placeholder={t('lobby.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {roomParam ? (
          <button
            type="button"
            className="rounded bg-brand-green px-4 py-2 font-semibold"
            onClick={() => lobby.joinRoom(roomParam, name)}
          >
            {t('lobby.join')}
          </button>
        ) : (
          <>
            <label className="flex items-center justify-between gap-2">
              {t('lobby.maxPlayers')}
              <select value={maxPlayers} onChange={(e) => setMax(Number(e.target.value))}>
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rounded bg-brand-green px-4 py-2 font-semibold"
              onClick={() => lobby.createRoom(name, maxPlayers)}
            >
              {t('lobby.create')}
            </button>
          </>
        )}
      </div>
    )
  }

  const peers = lobby.state ? Object.values(lobby.state.peers) : []
  const shareLink = lobby.roomCode ? `${window.location.origin}/?room=${lobby.state?.hostId}` : null

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-8">
      {lobby.roomCode && (
        <div className="rounded bg-surface-1 p-4">
          <p className="text-sm opacity-70">{t('lobby.roomCode')}</p>
          <p className="font-bold text-2xl tracking-widest">{lobby.roomCode}</p>
          {shareLink && <p className="mt-1 break-all text-xs opacity-60">{shareLink}</p>}
        </div>
      )}

      <section>
        <h2 className="mb-2 font-semibold">{t('lobby.players')}</h2>
        <ul className="flex flex-col gap-1">
          {peers.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded bg-surface-1 px-3 py-2"
            >
              <span className="flex items-center gap-2">
                <span>{p.name}</span>
                <span className="opacity-70">{roleLabel(p.role, t)}</span>
                {p.ready ? (
                  <span role="img" aria-label={t('lobby.ready')}>
                    {t('lobby.readyMark')}
                  </span>
                ) : null}
              </span>
              {lobby.isHost && p.role !== 'host' && (
                <button
                  type="button"
                  className="text-cat-attack text-sm"
                  onClick={() => lobby.kick(p.id)}
                >
                  {t('lobby.kick')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        className="rounded border border-fg/20 bg-surface-1 px-4 py-2"
        onClick={lobby.ready}
      >
        {t('lobby.ready')}
      </button>

      {lobby.isHost && (
        <button
          type="button"
          disabled={!lobby.canStart}
          className="rounded bg-brand-green px-4 py-2 font-semibold disabled:opacity-40"
          onClick={() => {
            /* start handler wired by the game-screen spec */
          }}
        >
          {t('lobby.start')}
        </button>
      )}
    </div>
  )
}
