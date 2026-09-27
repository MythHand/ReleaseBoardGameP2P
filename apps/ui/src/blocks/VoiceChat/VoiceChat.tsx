import HeadphonesIcon from '@/icons/HeadphonesIcon'
import PersonIcon from '@/icons/PersonIcon'
import Avatar from '@/primitives/Avatar'
import Button from '@/primitives/Button'
import type { MessageRole } from '@/primitives/Message'
import Popover from '@/primitives/Popover'
import Slider from '@/primitives/Slider'
import Typography from '@/primitives/Typography'
import styles from './VoiceChat.module.css'

// Volumes are percent of normal: 100 is as loud as the voice arrives, 200 twice
// that. A participant's volume sits inside the chat's own, so the two multiply.
const VOLUME_MAX = 200

// who a participant is in the room — the same roles, and colours, as the text chat
export type VoiceRole = MessageRole

// the list reads host first, then the players, then the spectators: the order
// and the colour say it, without headings
const ROLE_ORDER: Record<VoiceRole, number> = { host: 0, player: 1, spectator: 2 }

export interface VoiceParticipant {
  id: string
  name: string
  role: VoiceRole
  // this participant's volume for me, 0–200
  volume: number
}

export interface VoiceChatCopy {
  // what the person-and-count names, for a screen reader
  inVoice: string
  // the headphones' two states, said aloud and on hover
  connect: string
  disconnect: string
  // the chat's own volume, atop the list
  volume: string
  // marks me in the list of participants
  you: string
}

interface VoiceChatProps {
  // who is in the voice chat right now — me included once I am connected
  participants: VoiceParticipant[]
  connected: boolean
  // which participant is me: my own voice is not played back, so I have no
  // volume of my own in the list
  selfId?: string
  // the chat's own volume, 0–200
  volume: number
  copy: VoiceChatCopy
  onConnect?: () => void
  onDisconnect?: () => void
  onVolumeChange?: (volume: number) => void
  onParticipantVolumeChange?: (id: string, volume: number) => void
  className?: string
}

// The voice chat is one line, meant for the end of its heading: how many are in
// it — and who, behind a click on the count — and the headphones, the way in and
// out, lit once I am in. The volumes live behind the count too: the chat's own
// atop the list, each person's beside their name. An empty voice chat shows no
// count. Like Chat it names nothing itself — the place it stands in does. Its
// state arrives through props, because where the voices come from is not the
// kit's to know.
export default function VoiceChat({
  participants,
  connected,
  selfId,
  volume,
  copy,
  onConnect,
  onDisconnect,
  onVolumeChange,
  onParticipantVolumeChange,
  className = '',
}: VoiceChatProps) {
  const listed = [...participants].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
  const headphones = connected ? copy.disconnect : copy.connect
  return (
    <div className={`${styles.line} ${className}`}>
      {participants.length > 0 && (
        // the list opens along the line's right edge — the column's — so every
        // volume inside stands in one column
        <Popover
          variant="bare"
          align="end"
          anchor="parent"
          flush
          ariaLabel={`${copy.inVoice} ${participants.length}`}
          trigger={
            <span className={styles.people}>
              <PersonIcon size={16} />
              <Typography base="mono-md" tk="tk-10" as="span">
                {participants.length}
              </Typography>
            </span>
          }
        >
          <div className={styles.panel}>
            {connected && (
              <div className={`${styles.person} ${styles.overall}`}>
                <Typography base="mono-md" tk="tk-04" as="span" className={styles.name}>
                  {copy.volume}
                </Typography>
                <Slider
                  value={volume}
                  min={0}
                  max={VOLUME_MAX}
                  onChange={onVolumeChange}
                  className={styles.personVolume}
                />
              </div>
            )}
            <ul className={styles.list}>
              {listed.map((p) => {
                const self = p.id === selfId
                return (
                  <li key={p.id} className={styles.person}>
                    <Avatar name={p.name} size={24} />
                    <Typography
                      base="mono-md"
                      tk="tk-04"
                      as="span"
                      className={`${styles.name} ${styles[p.role]}`}
                    >
                      {p.name}
                      {self && <span className={styles.you}> · {copy.you}</span>}
                    </Typography>
                    {connected && !self && (
                      <Slider
                        value={p.volume}
                        min={0}
                        max={VOLUME_MAX}
                        onChange={(v) => onParticipantVolumeChange?.(p.id, v)}
                        className={styles.personVolume}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </Popover>
      )}
      <Button
        variant="bare"
        aria-label={headphones}
        aria-pressed={connected}
        title={headphones}
        onClick={connected ? onDisconnect : onConnect}
        className={styles.join}
      >
        <span className={connected ? styles.on : styles.off}>
          <HeadphonesIcon size={20} />
        </span>
      </Button>
    </div>
  )
}
