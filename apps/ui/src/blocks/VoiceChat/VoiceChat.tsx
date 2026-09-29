import HeadphonesIcon from '@/icons/HeadphonesIcon'
import MicrophoneSlashIcon from '@/icons/MicrophoneSlashIcon'
import PersonIcon from '@/icons/PersonIcon'
import SpeakerSlashIcon from '@/icons/SpeakerSlashIcon'
import Avatar from '@/primitives/Avatar'
import Button from '@/primitives/Button'
import type { MessageRole } from '@/primitives/Message'
import Popover from '@/primitives/Popover'
import ScrollArea from '@/primitives/ScrollArea'
import Slider from '@/primitives/Slider'
import Typography from '@/primitives/Typography'
import styles from './VoiceChat.module.css'

// Volumes are percent of normal: 100 is as loud as the voice arrives, 200 twice
// that. A participant's volume sits inside the chat's own, so the two multiply.
const VOLUME_MAX = 200

// a volume reads in percent, set in the names' own face rather than the
// slider's larger numeric one (owner, 29.09)
const VOLUME_VALUE = { unit: '%', valueBase: 'mono-md', valueTk: 'tk-04' } as const

// who a participant is in the room — the same roles, and colours, as the text chat
export type VoiceRole = MessageRole

// the list reads host first, then the players, then the spectators: the order
// and the colour say it, without headings
const ROLE_ORDER: Record<VoiceRole, number> = { host: 0, player: 1, spectator: 2 }

export interface VoiceParticipant {
  // the member's id — stable across reconnects, the way the text chat marks its
  // own (`selfMemberId`); never the peer's connection id, which a reconnect
  // replaces
  id: string
  name: string
  role: VoiceRole
  // this participant's volume for me, 0–200
  volume: number
  // I muted them, for me alone. Kept apart from the volume, so unmuting brings
  // back the level they had.
  muted?: boolean
  // they turned their own microphone off
  micOff?: boolean
}

// Where my headphones stand. Joining is not instant — the browser asks for the
// microphone, the calls take a moment — and a connection can break off while I
// am in; so four states, not two.
export type VoiceStatus = 'off' | 'connecting' | 'connected' | 'interrupted'

// in the voice chat: connected, or still in it while the connection broke off
const isIn = (status: VoiceStatus) => status === 'connected' || status === 'interrupted'

export interface VoiceChatCopy {
  // what the person-and-count names, for a screen reader
  inVoice: string
  // the headphones in each state, said aloud and on hover
  connect: string
  connecting: string
  disconnect: string
  interrupted: string
  // the chat's own volume, atop the list
  volume: string
  // marks me in the list of participants
  you: string
  // the speaker beside a participant's volume, said with their name
  mute: string
  unmute: string
  // my own microphone, beside the headphones
  muteMic: string
  unmuteMic: string
  // beside the name of a participant who turned their microphone off
  micMuted: string
}

interface VoiceState {
  // who is in the voice chat right now — me included once I am connected
  participants: VoiceParticipant[]
  status: VoiceStatus
  // which participant is me: my own voice is not played back, so I have no
  // volume of my own in the list
  selfId?: string
  // the chat's own volume, 0–200
  volume: number
  // I turned my own microphone off
  micOff?: boolean
  copy: VoiceChatCopy
  onConnect?: () => void
  onDisconnect?: () => void
  onVolumeChange?: (volume: number) => void
  onParticipantVolumeChange?: (id: string, volume: number) => void
  onParticipantMuteChange?: (id: string, muted: boolean) => void
  onMicChange?: (off: boolean) => void
}

// ---- the parts every place shares ------------------------------------------

// how many are in the voice chat
function Count({ count }: { count: number }) {
  return (
    <span className={styles.people}>
      <PersonIcon size={16} />
      <Typography base="mono-md" tk="tk-10" as="span">
        {count}
      </Typography>
    </span>
  )
}

// The way in and out: headphones coloured by where I stand. Off joins; while
// connecting a press does nothing — a second one would start a second join —
// yet the button keeps its colour and its hint (Button's own `disabled` would
// fade both); connected, or broken off, a press leaves.
function Headphones({
  status,
  copy,
  onConnect,
  onDisconnect,
}: Pick<VoiceState, 'status' | 'copy' | 'onConnect' | 'onDisconnect'>) {
  const label = {
    off: copy.connect,
    connecting: copy.connecting,
    connected: copy.disconnect,
    interrupted: `${copy.interrupted} · ${copy.disconnect}`,
  }[status]
  const action = status === 'off' ? onConnect : isIn(status) ? onDisconnect : undefined
  return (
    <Button
      variant="bare"
      aria-label={label}
      aria-pressed={status !== 'off'}
      aria-disabled={status === 'connecting' || undefined}
      title={label}
      onClick={action}
    >
      <span className={styles[status]}>
        <HeadphonesIcon size={20} />
      </span>
    </Button>
  )
}

// My own microphone, left of the headphones and only while I am in: grey while
// it works, red once I turned it off (owner, 29.09).
function Mic({
  status,
  micOff = false,
  copy,
  onMicChange,
}: Pick<VoiceState, 'status' | 'micOff' | 'copy' | 'onMicChange'>) {
  if (!isIn(status)) return null
  const label = micOff ? copy.unmuteMic : copy.muteMic
  return (
    <Button
      variant="bare"
      aria-label={label}
      aria-pressed={micOff}
      title={label}
      onClick={() => onMicChange?.(!micOff)}
    >
      <span className={micOff ? styles.muted : styles.off}>
        <MicrophoneSlashIcon size={20} />
      </span>
    </Button>
  )
}

// The microphone and the headphones, one pair at the end of the line, with the
// same room between them wherever they stand (owner, 29.09).
function Controls(state: VoiceState) {
  return (
    <span className={styles.controls}>
      <Mic {...state} />
      <Headphones {...state} />
    </span>
  )
}

// The volumes and the people: the chat's own volume on top once I am in, then
// everyone in it with a volume of their own. Every volume stands in one column
// at the right edge, whatever holds the list — a popover in the lobby, a panel
// at the table. The overall volume stays put; only the people under it scroll
// when there are more of them than room (owner, 29.09). Left of each other
// participant's volume, the speaker mutes them for me: grey while they are
// heard, red once muted, and a muted one's volume fades and greys its thumb, yet
// still moves. Right
// of a name, a grey microphone says they turned their own off (owner, 29.09).
function VoiceList({
  participants,
  status,
  selfId,
  volume,
  copy,
  onVolumeChange,
  onParticipantVolumeChange,
  onParticipantMuteChange,
}: VoiceState) {
  const listed = [...participants].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
  // the volumes are mine to set only while I am in
  const tuning = isIn(status)
  return (
    <div className={styles.voiceList}>
      {tuning && (
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
            {...VOLUME_VALUE}
          />
        </div>
      )}
      <ScrollArea
        className={styles.peopleScroll}
        contentClassName={tuning ? styles.underOverall : styles.alone}
      >
        <ul className={styles.list}>
          {listed.map((p) => {
            const self = p.id === selfId
            const muteLabel = `${p.muted ? copy.unmute : copy.mute} ${p.name}`
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
                  {!self && p.micOff && (
                    <span
                      className={styles.micOff}
                      role="img"
                      aria-label={copy.micMuted}
                      title={copy.micMuted}
                    >
                      <MicrophoneSlashIcon size={16} />
                    </span>
                  )}
                </Typography>
                {tuning && !self && (
                  <>
                    <Button
                      variant="bare"
                      aria-label={muteLabel}
                      aria-pressed={Boolean(p.muted)}
                      title={muteLabel}
                      onClick={() => onParticipantMuteChange?.(p.id, !p.muted)}
                    >
                      <span className={p.muted ? styles.muted : styles.off}>
                        <SpeakerSlashIcon size={16} />
                      </span>
                    </Button>
                    <Slider
                      value={p.volume}
                      min={0}
                      max={VOLUME_MAX}
                      onChange={(v) => onParticipantVolumeChange?.(p.id, v)}
                      className={`${styles.personVolume} ${p.muted ? styles.faded : ''}`}
                      thumbColor={p.muted ? 'var(--white-45)' : undefined}
                      {...VOLUME_VALUE}
                    />
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </ScrollArea>
    </div>
  )
}

// ---- the lobby: one line at the end of a heading ---------------------------

// The voice chat as one line, meant for the end of its heading in the lobby:
// how many are in it — and who, behind a click on the count — and the
// headphones. The volumes live behind the count too. An empty voice chat shows
// no count. Like Chat it names nothing itself — the place it stands in does.
// Its state arrives through props, because where the voices come from is not
// the kit's to know.
export default function VoiceChat({
  className = '',
  ...state
}: VoiceState & { className?: string }) {
  const { participants, copy } = state
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
          trigger={<Count count={participants.length} />}
        >
          {/* the popover is no taller than the room below it; the list shrinks
              into it and its people scroll, as in the table's panel */}
          <div className={styles.popoverBody}>
            <VoiceList {...state} />
          </div>
        </Popover>
      )}
      <Controls {...state} />
    </div>
  )
}

// ---- the table: a panel of its own -----------------------------------------

// The voice chat as a panel of its own — the table's, behind a tab of the right
// rail. Everything the lobby keeps behind the count is out in the open here: the
// head says what it is, how many are in it and holds the headphones; the
// volumes and the people follow. The title is the place's to give.
export function VoicePanel({ title, ...state }: VoiceState & { title: string }) {
  const { participants } = state
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <Typography base="tag" tk="tk-10" as="span" className={styles.panelTitle}>
          {title}
        </Typography>
        {participants.length > 0 && <Count count={participants.length} />}
        <Controls {...state} />
      </div>
      <VoiceList {...state} />
    </div>
  )
}

// The rail tab's own face: headphones in the tab's colour while I am out, and in
// the state's colour otherwise — so the table tells where I stand in the voice
// chat with its panel closed. Connected with my microphone off, the red
// microphone takes the headphones' place (owner, 29.09); a broken-off
// connection outranks it — the orange headphones stay (owner, 30.09).
export function VoiceTabIcon({
  status,
  micOff = false,
}: {
  status: VoiceStatus
  micOff?: boolean
}) {
  if (status === 'connected' && micOff) {
    return (
      <span className={styles.muted}>
        <MicrophoneSlashIcon size={20} />
      </span>
    )
  }
  return (
    <span className={status === 'off' ? styles.tabOff : styles[status]}>
      <HeadphonesIcon size={20} />
    </span>
  )
}
