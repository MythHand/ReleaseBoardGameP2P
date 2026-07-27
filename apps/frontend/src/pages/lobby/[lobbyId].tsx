import { useTranslation } from '@release/translation'
import { Button, Typography } from '@release/ui'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useSession } from '~/app/providers/SessionProvider'
import InviteScreen from './_InviteScreen'
import LobbyView from './_LobbyView'
import { card, ghostBtn, label, Shell, styles } from './_ui'

// /lobby/:lobbyId — the session-status flow for one lobby. A live session shows
// the lobby (or a Continue/Leave interstitial when arriving on top of a running
// one); with no session yet (e.g. a shared invite link) it shows the join form
// with the code pre-filled from the URL.
export default function LobbyPage() {
  const { t } = useTranslation()
  const session = useSession()
  // Distinguish "I just created/joined here" from "I arrived with a session
  // already running": seed from the mount-time status. Fresh mount (idle) →
  // go straight into the session once it starts; mount already in a session →
  // offer Continue / Leave first so an invite link isn't a dead end.
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
          <Typography variant="body" className={styles.statusText}>
            {session.status === 'kicked' ? t('lobby.kickedMessage') : t('lobby.disbandedMessage')}
          </Typography>
          <Link
            to="/start"
            className={`${ghostBtn} ${styles.backLink}`}
            onClick={() => session.leaveSession()}
          >
            <Typography base="body">{t('lobby.back')}</Typography>
          </Link>
        </div>
      </Shell>
    )
  }

  if (session.status === 'in-lobby' && session.state) {
    if (!continued) {
      return (
        <Shell>
          <div className={`${card} ${styles.cardStack}`}>
            <div>
              <Typography base="label-sm" tk="tk-16" as="p" className={label}>
                {t('lobby.activeSession')}
              </Typography>
              <Typography variant="code" as="p" className={styles.code}>
                {session.roomCode}
              </Typography>
            </div>
            <div className={styles.row}>
              <Button onClick={() => setContinued(true)}>{t('lobby.continue')}</Button>
              <Button variant="danger" onClick={() => session.leaveSession()}>
                {t('lobby.leave')}
              </Button>
            </div>
          </div>
        </Shell>
      )
    }
    // The channel is open but the host's roster hasn't arrived; show the
    // invite screen's `connected` beat rather than an empty lobby.
    if (!session.state.peers[session.state.hostId]) return <InviteScreen />
    return <LobbyView />
  }

  return <InviteScreen />
}
