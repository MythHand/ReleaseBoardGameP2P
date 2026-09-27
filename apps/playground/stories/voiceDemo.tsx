import { useEffect, useState } from 'react'
import type { VoiceStatus } from '@/blocks/VoiceChat'
import { makeVoiceOthers, VOICE_SELF } from '@/mocks/voice'
import { TechSwitch, TechToggle } from './controls/TechControls'

// how long a join takes on these pages — long enough to see the connecting state
const JOIN_MS = 1200

// The voice chat's demo state, shared by the Lobby, Table and Stats + chat
// pages: where I stand, whether anyone else is in, and the volumes. Pressing the
// headphones walks the real way — off, connecting, connected — and the tech bar
// sets any state directly, the broken-off one included: that one only the
// network brings.
export function useVoiceDemo() {
  const [status, setStatus] = useState<VoiceStatus>('off')
  const [occupied, setOccupied] = useState(false)
  const [others, setOthers] = useState(makeVoiceOthers)
  const [volume, setVolume] = useState(100)

  useEffect(() => {
    if (status !== 'connecting') return
    const id = setTimeout(() => setStatus('connected'), JOIN_MS)
    return () => clearTimeout(id)
  }, [status])

  const inVoice = status === 'connected' || status === 'interrupted'
  const participants = [...(inVoice ? [VOICE_SELF] : []), ...(occupied ? others : [])]

  return {
    status,
    setStatus,
    occupied,
    setOccupied,
    // everything the voice blocks take but their copy
    props: {
      participants,
      status,
      selfId: VOICE_SELF.id,
      volume,
      onConnect: () => setStatus('connecting'),
      onDisconnect: () => setStatus('off'),
      onVolumeChange: setVolume,
      onParticipantVolumeChange: (id: string, v: number) =>
        setOthers((prev) => prev.map((p) => (p.id === id ? { ...p, volume: v } : p))),
    },
  }
}

// The tech bar's part of it: my state, and whether anyone else is in.
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
      <TechToggle on={demo.occupied} onChange={demo.setOccupied}>
        others
      </TechToggle>
    </>
  )
}
