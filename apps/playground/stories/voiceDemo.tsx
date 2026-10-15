import { en as enCommon, ru as ruCommon } from '@release/translation/catalog'
import { useEffect, useState } from 'react'
import type { VoiceIssue as VoiceIssueView, VoiceStatus } from '@/blocks/VoiceChat'
import { makeVoiceOthers, VOICE_SELF, type VoiceOthersCount } from '@/mocks/voice'
import { type Lang, pick } from '../Playground/lang'
import HoverSelect from './controls/HoverSelect'
import { TechSwitch } from './controls/TechControls'

// how long a join takes on these pages — long enough to see the connecting state
const JOIN_MS = 1200

// What can go wrong with the voice, as the network raises it (#218): one at a
// time, the room's connection first, then the playback, then the calls, then
// the microphone. #218's one "calls failed" is two here (owner, 30.09): no
// voice with certain people, or no way into the voice chat at all.
export type VoiceIssue = keyof typeof ruCommon.voiceChat.issues
const ISSUES: { value: VoiceIssue; label: string }[] = [
  { value: 'roomDisconnected', label: 'room lost' },
  { value: 'audioBlocked', label: 'audio blocked' },
  { value: 'joinFailed', label: 'join failed' },
  { value: 'peersUnreachable', label: 'peers lost' },
  { value: 'microphoneDenied', label: 'mic denied' },
  { value: 'microphoneMissing', label: 'mic missing' },
  { value: 'permissionUnsupported', label: 'mic unsupported' },
  { value: 'permissionTimeout', label: 'mic timeout' },
  { value: 'captureFailed', label: 'mic failed' },
]
// The connection's issues come with the connection lost; the rest are the
// microphone's: I am in and can listen, my microphone off.
const CONNECTION_ISSUES: ReadonlySet<VoiceIssue> = new Set([
  'roomDisconnected',
  'audioBlocked',
  'joinFailed',
  'peersUnreachable',
])

// who "no voice connection with …" names on these pages; on the network it is
// whoever the calls failed with
const UNREACHABLE = 'segfault'

// Who can be speaking on these pages: me and the four. segfault has turned their
// own microphone off, so picking them shows that a muted microphone never rings.
const SPEAKERS = [VOICE_SELF.id, 'TabsOverSpaces', 'kernel_panic', 'null_ptr', 'segfault']

// The voice chat's demo state, shared by the Lobby, Table and Stats + chat
// pages: where I stand, how many others are in, the volumes, and what went
// wrong. Pressing the headphones walks the real way — off, connecting,
// connected — and the tech bar sets any state directly, the broken-off one and
// the issues included: those only the network brings.
export function useVoiceDemo() {
  const [status, setStatus] = useState<VoiceStatus>('off')
  const [othersCount, setOthersCount] = useState<VoiceOthersCount>(0)
  // all sixteen, so a volume or a mute set on one survives a switch of the count
  const [others, setOthers] = useState(makeVoiceOthers)
  const [volume, setVolume] = useState(100)
  const [micOff, setMicOff] = useState(false)
  const [issue, setIssue] = useState<VoiceIssue | null>(null)
  // who is talking, as the network would report it — before the rules of who
  // gets to see it
  const [speaker, setSpeaker] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'connecting') return
    const id = setTimeout(() => setStatus('connected'), JOIN_MS)
    return () => clearTimeout(id)
  }, [status])

  // An issue clears the way it does on the network: leaving the voice clears
  // any; a connection issue goes once the connection is no longer lost.
  const changeStatus = (next: VoiceStatus) => {
    setStatus(next)
    if (next === 'off' || (issue && CONNECTION_ISSUES.has(issue) && next !== 'interrupted')) {
      setIssue(null)
    }
  }
  // Picking an issue brings the state it comes with.
  const changeIssue = (next: VoiceIssue | null) => {
    setIssue(next)
    if (!next) return
    if (CONNECTION_ISSUES.has(next)) {
      setStatus('interrupted')
    } else {
      setStatus('connected')
      setMicOff(true)
    }
  }
  // A microphone issue goes once the microphone turns on.
  const changeMic = (off: boolean) => {
    setMicOff(off)
    if (!off && issue && !CONNECTION_ISSUES.has(issue)) setIssue(null)
  }

  const inVoice = status === 'connected' || status === 'interrupted'
  const shownOthers = others.slice(0, othersCount)

  // What I see of the speaking (owner, 07.10): only while I am on the line — a
  // broken-off connection brings nothing, and as in Discord nobody outside the
  // voice sees who talks; never someone I muted for myself; never a microphone
  // that is off. Mine rings when I talk with my microphone on.
  const speakerSeen = (() => {
    if (status !== 'connected' || !speaker) return null
    if (speaker === VOICE_SELF.id) return micOff ? null : speaker
    const other = shownOthers.find((p) => p.id === speaker)
    return other && !other.muted && !other.micOff ? speaker : null
  })()
  const speaking = speakerSeen ? [speakerSeen] : []

  const participants = [...(inVoice ? [VOICE_SELF] : []), ...shownOthers].map((p) => ({
    ...p,
    speaking: p.id === speakerSeen,
  }))

  return {
    status,
    setStatus: changeStatus,
    othersCount,
    setOthersCount,
    issue,
    setIssue: changeIssue,
    speaker,
    setSpeaker,
    // the ids (= nicknames) speaking as I see them, for the rows of the screen
    speaking,
    // everything the voice blocks take but their copy
    props: {
      participants,
      status,
      selfId: VOICE_SELF.id,
      volume,
      micOff,
      onConnect: () => changeStatus('connecting'),
      onDisconnect: () => changeStatus('off'),
      onVolumeChange: setVolume,
      onParticipantVolumeChange: (id: string, v: number) =>
        setOthers((prev) => prev.map((p) => (p.id === id ? { ...p, volume: v } : p))),
      onParticipantMuteChange: (id: string, muted: boolean) =>
        setOthers((prev) => prev.map((p) => (p.id === id ? { ...p, muted } : p))),
      onMicChange: changeMic,
    },
  }
}

// The tech bar's part of it: my state, how many others are in, and an issue.
export function VoiceDemoControls({ demo }: { demo: ReturnType<typeof useVoiceDemo> }) {
  return (
    <>
      <TechSwitch
        label="voice"
        options={[
          { value: 'off', label: 'off' },
          { value: 'connecting', label: 'connecting' },
          { value: 'connected', label: 'on' },
          { value: 'interrupted', label: 'lost' },
        ]}
        value={demo.status}
        onChange={demo.setStatus}
      />
      <TechSwitch
        label="others"
        options={[
          { value: 0, label: '0' },
          { value: 4, label: '4' },
          { value: 16, label: '16' },
        ]}
        value={demo.othersCount}
        onChange={demo.setOthersCount}
      />
      <HoverSelect
        label="issue"
        options={[{ value: 'none', label: 'none' }, ...ISSUES]}
        value={demo.issue ?? 'none'}
        onChange={(v) => demo.setIssue(v === 'none' ? null : (v as VoiceIssue))}
      />
      <HoverSelect
        label="speaks"
        options={[
          { value: 'none', label: 'nobody' },
          ...SPEAKERS.map((id) => ({ value: id, label: id === VOICE_SELF.id ? `${id} (me)` : id })),
        ]}
        value={demo.speaker ?? 'none'}
        onChange={(v) => demo.setSpeaker(v === 'none' ? null : v)}
      />
    </>
  )
}

// The issue as the voice block takes it: its title and text in the page's
// language, and what it concerns.
export function voiceIssueView(issue: VoiceIssue | null, lang: Lang): VoiceIssueView | null {
  if (!issue) return null
  const copy = pick(lang, { ru: ruCommon.voiceChat.issues, en: enCommon.voiceChat.issues })[issue]
  return {
    key: issue,
    title: copy.title.replace('{{names}}', UNREACHABLE),
    text: copy.text,
    concerns: CONNECTION_ISSUES.has(issue) ? 'connection' : 'microphone',
  }
}
