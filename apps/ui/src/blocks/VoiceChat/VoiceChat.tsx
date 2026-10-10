import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { play } from '@/animations/play'
import PresetAvatar from '@/avatars/PresetAvatar'
import { useAppear } from '@/blocks/Toast/useAppear'
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
  // preset avatar id — a player has one, a spectator does not
  avatar?: string
  // speaking — the ring around the avatar. Whether I see it (I am on the line,
  // I have not muted them) is the consumer's to decide.
  speaking?: boolean
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
  // the cross that closes a notice before its time
  close: string
}

// What went wrong with my voice, as the place hands it in: one at a time, the
// network's to tell. It concerns either my microphone or my connection — the
// button it explains carries it in its hint for as long as it lasts.
export interface VoiceIssue {
  // which problem this is; a new key is a new notice
  key: string
  title: string
  text: string
  concerns: 'microphone' | 'connection'
}

// how long a notice stays, ms — as long as a chat toast (ToastStack's hold)
const NOTICE_HOLD = 6000

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
// fade both); connected, or broken off, a press leaves. A connection issue,
// while it lasts, names what broke in place of the plain "connection lost".
function Headphones({
  status,
  copy,
  issue,
  onConnect,
  onDisconnect,
}: Pick<VoiceState, 'status' | 'copy' | 'onConnect' | 'onDisconnect'> & {
  issue?: VoiceIssue | null
}) {
  const broke = issue?.concerns === 'connection' ? issue.title : copy.interrupted
  const label = {
    off: copy.connect,
    connecting: copy.connecting,
    connected: copy.disconnect,
    interrupted: `${broke} · ${copy.disconnect}`,
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
// it works, red once I turned it off (owner, 29.09). A microphone issue, while it
// lasts, says in the hint why it is off.
function Mic({
  status,
  micOff = false,
  copy,
  issue,
  onMicChange,
}: Pick<VoiceState, 'status' | 'micOff' | 'copy' | 'onMicChange'> & {
  issue?: VoiceIssue | null
}) {
  if (!isIn(status)) return null
  const action = micOff ? copy.unmuteMic : copy.muteMic
  const label = issue?.concerns === 'microphone' ? `${issue.title} · ${action}` : action
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

interface LiveNotice {
  id: number
  issue: VoiceIssue
  // its leave has begun: still on screen, playing its way out
  leaving: boolean
}

const startLeave = (id: number) => (prev: LiveNotice[]) =>
  prev.map((l) => (l.id === id ? { ...l, leaving: true } : l))

// One notice: a chat toast's dress — the black plate, a title and a text — with a
// cross on the right. It comes down from above and plays its own way out, then
// says so (`onLeft`), like a toast.
function Notice({
  id,
  issue,
  leaving,
  closeLabel,
  onClose,
  onLeft,
  onHover,
}: {
  id: number
  issue: VoiceIssue
  leaving: boolean
  closeLabel: string
  onClose: (id: number) => void
  onLeft: (id: number) => void
  onHover: (over: boolean) => void
}) {
  const left = useCallback(() => onLeft(id), [onLeft, id])
  const ref = useAppear<HTMLDivElement>(leaving, left, -18)
  return (
    <div
      ref={ref}
      role="status"
      className={styles.notice}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div className={styles.noticeBody}>
        <Typography
          base="mono-sm"
          tk="tk-02"
          as="div"
          className={`${styles.noticeTitle} ${styles[issue.concerns]}`}
        >
          {issue.title}
        </Typography>
        <Typography as="p" base="body-sm" className={styles.noticeText}>
          {issue.text}
        </Typography>
      </div>
      <button
        type="button"
        className={styles.noticeClose}
        aria-label={closeLabel}
        title={closeLabel}
        onClick={() => onClose(id)}
      >
        ✕
      </button>
    </div>
  )
}

// The notices under the microphone and the headphones (owner, 30.09). A problem
// shows once, over whatever lies below, and goes by itself after a while — or
// on its cross; one that is over takes its notice with it. Several at once stand
// one under another. Hovering holds them all, the way a chat toast is held.
function Notices({ issue, closeLabel }: { issue?: VoiceIssue | null; closeLabel: string }) {
  const [live, setLive] = useState<LiveNotice[]>([])
  const [paused, setPaused] = useState(false)
  const lastKey = useRef<string | null>(null)
  const nextId = useRef(0)

  useEffect(() => {
    const key = issue?.key ?? null
    if (key === lastKey.current) return
    lastKey.current = key
    if (!issue) {
      setLive((prev) => prev.map((l) => ({ ...l, leaving: true })))
      return
    }
    setLive((prev) =>
      prev.some((l) => l.issue.key === issue.key && !l.leaving)
        ? prev
        : [...prev, { id: nextId.current++, issue, leaving: false }],
    )
  }, [issue])

  // Each notice holds for its time; hovering lifts every clock, leaving sets
  // them again in full — the chat toasts' rule (ToastStack).
  const timers = useRef(new Map<number, number>())
  useEffect(() => {
    const map = timers.current
    if (paused) {
      for (const t of map.values()) clearTimeout(t)
      map.clear()
      return
    }
    for (const l of live) {
      if (l.leaving || map.has(l.id)) continue
      map.set(
        l.id,
        window.setTimeout(() => setLive(startLeave(l.id)), NOTICE_HOLD),
      )
    }
    for (const [id, t] of map) {
      if (!live.some((l) => l.id === id && !l.leaving)) {
        clearTimeout(t)
        map.delete(id)
      }
    }
  }, [live, paused])

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const t of map.values()) clearTimeout(t)
      map.clear()
    }
  }, [])

  // the last one gone takes the pointer's hold with it: it left under the
  // pointer, so no leave event will come to lift it
  useEffect(() => {
    if (live.length === 0) setPaused(false)
  }, [live.length])

  const close = useCallback((id: number) => setLive(startLeave(id)), [])
  const remove = useCallback((id: number) => setLive((prev) => prev.filter((l) => l.id !== id)), [])

  // The ones below ride up into a gone one's place rather than jump: each
  // notice's place is measured before and after the redraw and the difference
  // played (flyFrom) — the chat toasts' own way (ToastStack). A new one has no
  // place to come from; it has its own arrival.
  const nodes = useRef(new Map<number, HTMLElement>())
  const rects = useRef(new Map<number, DOMRect>())
  useLayoutEffect(() => {
    for (const [id, el] of nodes.current) {
      const now = el.getBoundingClientRect()
      const was = rects.current.get(id)
      if (was && Math.abs(was.top - now.top) > 0.5) {
        play('flyFrom', el, { from: was, duration: 240 })
      }
      rects.current.set(id, now)
    }
    for (const id of [...rects.current.keys()]) {
      if (!nodes.current.has(id)) rects.current.delete(id)
    }
  })

  if (live.length === 0) return null
  return (
    <div className={styles.notices}>
      {live.map((l) => (
        <div
          key={l.id}
          ref={(el) => {
            if (el) nodes.current.set(l.id, el)
            else nodes.current.delete(l.id)
          }}
        >
          <Notice
            id={l.id}
            issue={l.issue}
            leaving={l.leaving}
            closeLabel={closeLabel}
            onClose={close}
            onLeft={remove}
            onHover={setPaused}
          />
        </div>
      ))}
    </div>
  )
}

// The microphone and the headphones, one pair at the end of the line, with the
// same room between them wherever they stand (owner, 29.09); the notices hang
// under the pair — unless the place hangs them itself (the table's panel).
function Controls({
  issue,
  notices = true,
  ...state
}: VoiceState & { issue?: VoiceIssue | null; notices?: boolean }) {
  return (
    <span className={styles.controls}>
      <Mic {...state} issue={issue} />
      <Headphones {...state} issue={issue} />
      {notices && <Notices issue={issue} closeLabel={state.copy.close} />}
    </span>
  )
}

// The notices on their own, for a place whose microphone and headphones can be
// out of sight: the table, where the voice panel closes into the rail. They
// hang under whatever positioned box holds them, as they hang under the pair;
// the table gives them the pair's place in the open panel (owner, 30.09).
export function VoiceNotices({
  issue,
  copy,
}: {
  issue?: VoiceIssue | null
  copy: Pick<VoiceChatCopy, 'close'>
}) {
  return <Notices issue={issue} closeLabel={copy.close} />
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
                {p.avatar ? (
                  <PresetAvatar id={p.avatar} size={24} speaking={p.speaking} />
                ) : (
                  <Avatar name={p.name} size={24} speaking={p.speaking} />
                )}
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
// the kit's to know — what went wrong with them too (`issue`), shown as a
// notice under the microphone and the headphones.
export default function VoiceChat({
  className = '',
  issue,
  ...state
}: VoiceState & { issue?: VoiceIssue | null; className?: string }) {
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
      <Controls {...state} issue={issue} />
    </div>
  )
}

// ---- the table: a panel of its own -----------------------------------------

// The voice chat as a panel of its own — the table's, behind a tab of the right
// rail. Everything the lobby keeps behind the count is out in the open here: the
// head says what it is, how many are in it and holds the headphones; the
// volumes and the people follow. The title is the place's to give.
// An issue only names itself in the buttons' hints here: the table hangs its
// notices where the panel can close away from them (VoiceNotices).
export function VoicePanel({
  title,
  issue,
  ...state
}: VoiceState & { title: string; issue?: VoiceIssue | null }) {
  const { participants } = state
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <Typography base="tag" tk="tk-10" as="span" className={styles.panelTitle}>
          {title}
        </Typography>
        {participants.length > 0 && <Count count={participants.length} />}
        <Controls {...state} issue={issue} notices={false} />
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
