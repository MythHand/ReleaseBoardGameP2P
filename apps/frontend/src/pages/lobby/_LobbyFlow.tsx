import { useTranslation } from '@release/translation'
import { Button } from '@release/ui'
import { type ReactNode, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useSession } from '~/app/providers/SessionProvider'
import LobbyView from './_LobbyView'
import { card, ghostBtn, label, Shell } from './_ui'

// Owns the session status flow shared by both lobby modes. The mode-specific
// pre-session form (_CreateForm / _JoinForm) is passed as `children` and only
// rendered before a session exists.
export default function LobbyFlow({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const session = useSession()
  // Distinguish "I just created/joined here" from "I arrived with a session
  // already running": seed from the mount-time status. Fresh mount (idle) →
  // go straight into the session once it starts; mount already in a session →
  // offer Continue / Leave first so clicking Create/Connect isn't a dead end.
  const location = useLocation()
  const [continued, setContinued] = useState(
    session.status !== 'in-lobby' || !!(location.state as { resumed?: boolean } | null)?.resumed,
  )

  // Clear a stale error left by a previous visit (e.g. a failed join) when the
  // lobby mounts, so arriving fresh shows the form, not an old error banner.
  // clearError is a no-op for a live session, so this is safe on every mount.
  const { clearError } = session
  useEffect(() => {
    clearError()
  }, [clearError])

  if (session.status === 'kicked' || session.status === 'disbanded') {
    return (
      <Shell>
        <div className={card}>
          <p className="text-fg/80">
            {session.status === 'kicked' ? t('lobby.kickedMessage') : t('lobby.disbandedMessage')}
          </p>
          <Link
            to="/start"
            className={`${ghostBtn} mt-4 inline-block`}
            onClick={() => session.leaveSession()}
          >
            {t('lobby.back')}
          </Link>
        </div>
      </Shell>
    )
  }

  if (session.status === 'in-lobby' && session.state) {
    if (!continued) {
      return (
        <Shell>
          <div className={`${card} flex flex-col gap-4`}>
            <div>
              <p className={label}>{t('lobby.activeSession')}</p>
              <p className="font-bold text-2xl text-brand-green tracking-widest">
                {session.roomCode}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setContinued(true)}>{t('lobby.continue')}</Button>
              <Button variant="danger" onClick={() => session.leaveSession()}>
                {t('lobby.drop')}
              </Button>
            </div>
          </div>
        </Shell>
      )
    }
    return <LobbyView />
  }

  return (
    <Shell>
      {session.error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400 text-sm">
          {session.error}
        </p>
      )}
      {session.status === 'connecting' && (
        <p className="text-fg/60 text-sm">{t('lobby.connecting')}</p>
      )}
      {children}
      {/* No live session here (idle/connecting/error) — Back just resets any
          dangling transport/error and returns to the chooser. */}
      <Link to="/start" className={`${ghostBtn} self-start`} onClick={() => session.leaveSession()}>
        {t('lobby.back')}
      </Link>
    </Shell>
  )
}
