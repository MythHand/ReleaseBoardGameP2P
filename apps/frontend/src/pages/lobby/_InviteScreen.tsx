import { useTranslation } from '@release/translation'
import { Button, randomNickname, Spinner, sanitizeNickname, Typography } from '@release/ui'
import { useState } from 'react'
import { useLocation, useParams } from 'react-router'
import DiceIcon from '@/icons/DiceIcon'
import { useGoToLobby } from '~/app/lib/lobbyNavigation'
import { useSession } from '~/app/providers/SessionProvider'
import { useNavigate } from '~/app/router'
import { useJoinLobby } from '~/features/join-lobby/useJoinLobby'
import Form, { FormField } from '~/shared/ui/Form'
import ScreenShell from '~/shared/ui/ScreenShell'
import styles from './_InviteScreen.module.css'

// The invite screen (/lobby/:lobbyId before a live session). The session status
// drives which of the five states the action slot shows; the form itself stays
// visible throughout, disabled while a connection is in flight.
export default function InviteScreen() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const joinLobby = useJoinLobby()
  const goToLobby = useGoToLobby()
  const navigate = useNavigate()
  // On an invite link the code is in the URL; it pre-fills the field.
  const { lobbyId } = useParams()
  // A join started in the start-screen modal hands its nickname over through
  // navigation state, so arriving here — including on a failure — keeps what
  // the user already typed instead of making them enter it twice.
  const location = useLocation()
  const [name, setName] = useState((location.state as { nickname?: string } | null)?.nickname ?? '')

  // Connected, but the host's PEER_LIST hasn't landed yet: joinRoom seeds
  // `peers` with only the joiner, and applyPeerList swaps in the full roster
  // (which includes the host). So the host's absence IS "roster not yet here".
  // A host has selfId === hostId, so it never reads as connected.
  const rosterPending =
    session.status === 'in-lobby' && !!session.state && !session.state.peers[session.state.hostId]

  const connecting = session.status === 'connecting'
  const connected = rosterPending
  const busy = connecting || connected

  // The action slot's status line — localized, never the raw PeerJS string.
  const status =
    session.status === 'error'
      ? session.errorKind === 'not-found'
        ? t('invite.notFoundStatus')
        : t('invite.connectError')
      : null

  const lang = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'

  return (
    <ScreenShell
      tags={[t('start.tagOpenP2P'), t('start.tagBoardCard')]}
      description={t('start.description')}
      // the form is 513px tall — the hero rhythm would push its CTA below the fold
      density="compact"
      lang={lang}
      onLangChange={(next) => i18n.changeLanguage(next)}
    >
      <Form
        className={styles.form}
        requiredMessage={t('start.required')}
        onSubmit={async (data) => {
          if (busy) return
          const nickname = sanitizeNickname(data.name ?? '').trim()
          const code = data.code ?? ''
          if (!nickname || !code.trim()) return
          try {
            // A setup failure rejects here and surfaces through
            // session.error/errorKind, so only navigate on success.
            const formatted = await joinLobby(code, nickname)
            goToLobby(formatted)
          } catch {
            // Already surfaced as failed / notFound; stay on the screen.
          }
        }}
      >
        <Typography base="heading-8" tk="tk-05" as="h2" className={styles.formTitle}>
          {t('invite.formTitle')}
        </Typography>

        <div className={styles.fields}>
          {/* Role choice comes first. Spectator is disabled: the host assigns
                the role (assignRole) and the wire protocol carries no requested
                role, so guest mode isn't supported yet. */}
          <div className={styles.role}>
            <Typography base="label-sm" tk="tk-16" as="span" className={styles.roleLabel}>
              {t('invite.roleTitle')}
            </Typography>
            <div className={styles.roleOptions}>
              <button
                type="button"
                disabled={busy}
                className={`${styles.roleOpt} ${styles.roleOptOn}`}
              >
                <Typography base="label-md" tk="tk-12">
                  {t('invite.rolePlayer')}
                </Typography>
              </button>
              <button type="button" disabled className={styles.roleOpt}>
                <Typography base="label-md" tk="tk-12">
                  {t('invite.roleSpectator')}
                </Typography>
              </button>
            </div>
          </div>

          <FormField
            name="name"
            label={t('invite.nicknameLabel')}
            placeholder={t('invite.nicknamePlaceholder')}
            maxLength={20}
            required
            plain
            disabled={busy}
            value={name}
            onChange={(e) => setName(sanitizeNickname(e.target.value))}
            trailing={
              <Button
                variant="icon"
                onClick={() => setName(randomNickname())}
                aria-label={t('invite.randomNick')}
                title={t('invite.randomNick')}
              >
                <DiceIcon />
              </Button>
            }
          />
          <FormField
            // key on lobbyId so following a second invite link (client-side
            // nav swaps :lobbyId without remounting this screen) remounts the
            // field and re-seeds defaultValue — an uncontrolled field keeps its
            // first mount's value otherwise and would submit the stale code.
            key={lobbyId ?? ''}
            name="code"
            label={t('invite.codeLabel')}
            defaultValue={lobbyId ?? ''}
            required
            disabled={busy}
          />
        </div>

        <div className={styles.action}>
          {status && (
            <Typography base="label-sm" tk="tk-10" as="span" className={styles.actionError}>
              {status}
            </Typography>
          )}
          <div className={styles.actionRow}>
            {connecting ? (
              <div className={styles.connecting}>
                <Typography base="button" tk="tk-18" as="span" className={styles.connectingStatus}>
                  <Spinner size={16} />
                  {t('invite.connecting')}
                </Typography>
                <Button variant="tech" onClick={() => session.leaveSession()}>
                  {t('invite.cancel')}
                </Button>
              </div>
            ) : connected ? (
              <Typography base="button" tk="tk-18" as="span" className={styles.connected}>
                {t('invite.connected')}
              </Typography>
            ) : (
              // Retry is the same submit — only the label changes.
              <Button type="submit">{status ? t('invite.retry') : t('invite.joinCta')}</Button>
            )}
          </div>
        </div>
      </Form>

      <div className={styles.home}>
        <Button
          onClick={() => {
            session.leaveSession()
            navigate('/start')
          }}
        >
          {t('invite.homePage')}
        </Button>
      </div>
    </ScreenShell>
  )
}
