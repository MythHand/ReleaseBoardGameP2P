import { useTranslation } from '@release/translation'
import { Button, randomNickname, Spinner, sanitizeNickname, Typography } from '@release/ui'
import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router'
import DiceIcon from '@/icons/DiceIcon'
import RefreshIcon from '@/icons/RefreshIcon'
import { useGoToLobby } from '~/app/lib/lobbyNavigation'
import { useSession } from '~/app/providers/SessionProvider'
import { useNavigate } from '~/app/router'
import { type JoinRole, parseRoomCode } from '~/entities/lobby'
import { useJoinLobby } from '~/features/join-lobby/useJoinLobby'
import { useRoomAvailability } from '~/features/join-lobby/useRoomAvailability'
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

  const [role, setRole] = useState<JoinRole>('player')
  const [code, setCode] = useState(lobbyId ?? '')
  useEffect(() => setCode(lobbyId ?? ''), [lobbyId])
  const roomCheck = useRoomAvailability(code)
  const availability =
    roomCheck.availability ??
    (session.roomCode && parseRoomCode(code) === parseRoomCode(session.roomCode)
      ? session.joinAvailability
      : null)
  const spectatorOnly = availability?.player === false && availability.spectator
  const noSlots = availability?.player === false && availability.spectator === false
  const effectiveRole: JoinRole = spectatorOnly ? 'spectator' : role
  const canJoin = name.trim().length > 0 && code.trim().length > 0

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
      ? session.errorKind === 'room-full'
        ? t('invite.fullStatus')
        : session.errorKind === 'not-found'
          ? t('invite.notFoundStatus')
          : t('invite.connectError')
      : null

  const lang = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'

  return (
    <ScreenShell
      tags={[t('start.tagOpenP2P'), t('invite.tagBoardCard')]}
      description={t('invite.description')}
      // The compact rhythm keeps the invitation action within the scrollable column.
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
          const submittedCode = data.code ?? ''
          if (noSlots) {
            await roomCheck.check()
            return
          }
          if (!nickname || !submittedCode.trim()) return
          // The real admission response must supersede this earlier capacity probe.
          roomCheck.reset()
          try {
            // A setup failure rejects here and surfaces through
            // session.error/errorKind, so only navigate on success.
            const formatted = await joinLobby(submittedCode, nickname, effectiveRole)
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
          <div className={styles.fieldWrap}>
            <FormField
              name="code"
              label={t('invite.codeLabel')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              error=""
              disabled={busy}
              trailing={
                <Button
                  variant="icon"
                  onClick={() => roomCheck.check()}
                  aria-label={t('invite.checkCode')}
                  title={t('invite.checkCode')}
                  disabled={busy}
                >
                  <RefreshIcon />
                </Button>
              }
            />
            <div className={styles.codeStatus} data-state={roomCheck.codeState}>
              {roomCheck.codeState === 'checking' && (
                <>
                  <Typography as="span" base="mono-xs">
                    {t('invite.codeChecking')}
                  </Typography>
                  <span className={styles.dots} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </>
              )}
              {roomCheck.codeState === 'error' && (
                <Typography as="span" base="mono-xs">
                  {t('invite.codeError')}
                </Typography>
              )}
            </div>
          </div>
          <div className={styles.role}>
            <Typography base="label-sm" tk="tk-16" as="span" className={styles.roleLabel}>
              {t('invite.roleTitle')}
            </Typography>
            <div className={styles.roleOptions}>
              <button
                type="button"
                disabled={busy || availability?.player === false}
                aria-pressed={effectiveRole === 'player'}
                onClick={() => setRole('player')}
                className={`${styles.roleOpt} ${!noSlots && effectiveRole === 'player' ? styles.roleOptOn : ''}`}
              >
                <Typography base="label-md" tk="tk-12">
                  {t('invite.rolePlayer')}
                </Typography>
              </button>
              <button
                type="button"
                disabled={busy || availability?.spectator === false}
                aria-pressed={effectiveRole === 'spectator'}
                onClick={() => setRole('spectator')}
                className={`${styles.roleOpt} ${!noSlots && effectiveRole === 'spectator' ? styles.roleOptOn : ''}`}
              >
                <Typography base="label-md" tk="tk-12">
                  {t('invite.roleSpectator')}
                </Typography>
              </button>
            </div>
            {(spectatorOnly || noSlots) && (
              <Typography as="span" base="mono-xs" className={styles.note}>
                {noSlots ? t('invite.noSlotsNote') : t('invite.spectatorOnlyNote')}
              </Typography>
            )}
          </div>

          <FormField
            name="name"
            label={t('invite.nicknameLabel')}
            placeholder={t('invite.nicknamePlaceholder')}
            error=""
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
              <Button type="submit" className={canJoin ? undefined : styles.joinIdle}>
                {noSlots
                  ? t('invite.checkSlots')
                  : status
                    ? t('invite.retry')
                    : t('invite.joinCta')}
              </Button>
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
