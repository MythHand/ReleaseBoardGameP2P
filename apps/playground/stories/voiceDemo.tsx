import { useEffect, useState } from 'react'
import type { VoiceStatus } from '@/blocks/VoiceChat'
import { makeVoiceOthers, VOICE_SELF, type VoiceOthersCount } from '@/mocks/voice'
import { TechSwitch } from './controls/TechControls'

// how long a join takes on these pages — long enough to see the connecting state
const JOIN_MS = 1200

// The voice chat's demo state, shared by the Lobby, Table and Stats + chat
// pages: where I stand, how many others are in, and the volumes. Pressing the
// headphones walks the real way — off, connecting, connected — and the tech bar
// sets any state directly, the broken-off one included: that one only the
// network brings.
export function useVoiceDemo() {
  const [status, setStatus] = useState<VoiceStatus>('off')
  const [othersCount, setOthersCount] = useState<VoiceOthersCount>(0)
  // all sixteen, so a volume or a mute set on one survives a switch of the count
  const [others, setOthers] = useState(makeVoiceOthers)
  const [volume, setVolume] = useState(100)
  const [micOff, setMicOff] = useState(false)

  useEffect(() => {
    if (status !== 'connecting') return
    const id = setTimeout(() => setStatus('connected'), JOIN_MS)
    return () => clearTimeout(id)
  }, [status])

  const inVoice = status === 'connected' || status === 'interrupted'
  const participants = [...(inVoice ? [VOICE_SELF] : []), ...others.slice(0, othersCount)]

  return {
    status,
    setStatus,
    othersCount,
    setOthersCount,
    // everything the voice blocks take but their copy
    props: {
      participants,
      status,
      selfId: VOICE_SELF.id,
      volume,
      micOff,
      onConnect: () => setStatus('connecting'),
      onDisconnect: () => setStatus('off'),
      onVolumeChange: setVolume,
      onParticipantVolumeChange: (id: string, v: number) =>
        setOthers((prev) => prev.map((p) => (p.id === id ? { ...p, volume: v } : p))),
      onParticipantMuteChange: (id: string, muted: boolean) =>
        setOthers((prev) => prev.map((p) => (p.id === id ? { ...p, muted } : p))),
      onMicChange: setMicOff,
    },
  }
}

// The tech bar's part of it: my state, and how many others are in.
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
    </>
  )
}
