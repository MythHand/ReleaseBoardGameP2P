import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { permissions } from '~/shared/lib/permissions'
import { createVoiceAudio } from './audio'
import { createRoomVoice, type RoomVoice, type VoiceSnapshot } from './runtime'

export type RoomVoiceFacade = VoiceSnapshot &
  Pick<
    RoomVoice,
    | 'connect'
    | 'disconnect'
    | 'setMicOff'
    | 'setVolume'
    | 'setParticipantVolume'
    | 'setParticipantMuted'
  >

export function useRoomVoice(): { runtime: RoomVoice; view: RoomVoiceFacade } {
  const [runtime] = useState(() =>
    createRoomVoice({
      permissions,
      createAudio: () => createVoiceAudio(new AudioContext()),
      newId: () => crypto.randomUUID(),
    }),
  )
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  const mountGeneration = useRef(0)
  useEffect(() => {
    const generation = ++mountGeneration.current
    return () => {
      // Release hardware synchronously; StrictMode replays setup on the same runtime.
      runtime.updateRoom(null)
      queueMicrotask(() => {
        if (mountGeneration.current === generation) runtime.dispose()
      })
    }
  }, [runtime])
  const view = useMemo<RoomVoiceFacade>(
    () => ({
      ...snapshot,
      connect: runtime.connect,
      disconnect: runtime.disconnect,
      setMicOff: runtime.setMicOff,
      setVolume: runtime.setVolume,
      setParticipantVolume: runtime.setParticipantVolume,
      setParticipantMuted: runtime.setParticipantMuted,
    }),
    [runtime, snapshot],
  )
  return { runtime, view }
}
