import HeadphonesIcon from '@/icons/HeadphonesIcon'
import PersonIcon from '@/icons/PersonIcon'
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
  copy: VoiceChatCopy
  onConnect?: () => void
  onDisconnect?: () => void
  onVolumeChange?: (volume: number) => void
  onParticipantVolumeChange?: (id: string, volume: number) => void
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
      className={styles.join}
    >
      <span className={styles[status]}>
        <HeadphonesIcon size={20} />
      </span>
    </Button>
  )
}

// The volumes and the people: the chat's own volume on top once I am in, then
// everyone in it with a volume of their own. Every volume stands in one column
// at the right edge, whatever holds the list — a popover in the lobby, a panel
// at the table.
function VoiceList({
  participants,
  status,
  selfId,
  volume,
  copy,
  onVolumeChange,
  onParticipantVolumeChange,
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
              {tuning && !self && (
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
          <div className={styles.popoverBody}>
            <VoiceList {...state} />
          </div>
        </Popover>
      )}
      <Headphones {...state} />
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
        <Headphones {...state} />
      </div>
      <ScrollArea className={styles.panelScroll}>
        <VoiceList {...state} />
      </ScrollArea>
    </div>
  )
}

// The rail tab's own face: headphones in the tab's colour while I am out, and in
// the state's colour otherwise — so the table tells where I stand in the voice
// chat with its panel closed.
export function VoiceTabIcon({ status }: { status: VoiceStatus }) {
  return (
    <span className={status === 'off' ? styles.tabOff : styles[status]}>
      <HeadphonesIcon size={20} />
    </span>
  )
}
