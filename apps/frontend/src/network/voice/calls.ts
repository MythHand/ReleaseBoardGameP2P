import type {
  VoiceCallMetadata,
  VoiceMediaCall,
  VoiceMediaEvent,
  VoiceMediaPort,
} from '../transport/mediaTypes'
import type { VoiceAudio } from './audio'
import { CALL_SETUP_TIMEOUT_MS, createRetryScheduler } from './reconnect'
import type { VoicePresence } from './types'

export interface VoiceCallsState {
  readyMemberIds: string[]
  failedMemberIds: string[]
}
export interface VoiceCalls {
  reconcile(roster: VoicePresence[]): void
  replaceTrack(track: MediaStreamTrack): Promise<void>
  dispose(): void
}
export function shouldInitiateVoiceCall(selfMemberId: string, otherMemberId: string): boolean {
  return selfMemberId < otherMemberId
}
interface Entry {
  presence: VoicePresence
  call?: VoiceMediaCall
  stream?: MediaStream
  iceReady: boolean
  ready: boolean
  failed: boolean
  timer?: ReturnType<typeof setTimeout>
  unsubscribe?: () => void
  release?: () => void
  result: Promise<boolean>
  resolve(value: boolean): void
}
export function createVoiceCalls(options: {
  port: VoiceMediaPort
  audio: VoiceAudio
  self: VoicePresence
  onState: (state: VoiceCallsState) => void
}): VoiceCalls {
  const { port, audio, self } = options
  const entries = new Map<string, Entry>()
  const retry = createRetryScheduler()
  let desired = new Map<string, VoicePresence>()
  let disposed = false
  const key = (p: VoicePresence) => `${p.memberId}:${p.voiceSessionId}:${self.voiceSessionId}`
  const notify = () => {
    if (disposed) return
    options.onState({
      readyMemberIds: [...entries].filter(([, e]) => e.ready).map(([id]) => id),
      failedMemberIds: [...entries].filter(([, e]) => e.failed).map(([id]) => id),
    })
  }
  const clear = (entry: Entry) => {
    clearTimeout(entry.timer)
    entry.unsubscribe?.()
    entry.unsubscribe = undefined
    entry.release?.()
    entry.release = undefined
    entry.call?.close()
    entry.call = undefined
    entry.resolve(false)
  }
  const owns = (entry: Entry) => !disposed && entries.get(entry.presence.memberId) === entry
  const recover = (entry: Entry) => {
    if (!shouldInitiateVoiceCall(self.memberId, entry.presence.memberId)) return
    retry.start(key(entry.presence), () => {
      const p = desired.get(entry.presence.memberId)
      if (!p || key(p) !== key(entry.presence) || disposed) return Promise.resolve(true)
      return begin(p).result
    })
  }
  const fail = (entry: Entry, keepCall = false) => {
    if (!owns(entry)) return
    entry.ready = false
    entry.failed = true
    if (!keepCall) clear(entry)
    notify()
    recover(entry)
  }
  const ready = (entry: Entry) => {
    if (!owns(entry) || !entry.stream || !entry.iceReady) return
    entry.ready = true
    entry.failed = false
    clearTimeout(entry.timer)
    entry.resolve(true)
    retry.cancel(key(entry.presence))
    notify()
  }
  const events = (entry: Entry, event: VoiceMediaEvent) => {
    if (!owns(entry)) return
    if (event.type === 'stream') {
      if (entry.stream !== event.stream) {
        entry.release?.()
        entry.stream = event.stream
        try {
          entry.release = audio.attach(entry.presence.memberId, event.stream)
        } catch {
          fail(entry)
          return
        }
      }
      ready(entry)
    } else if (event.type === 'ice') {
      entry.iceReady = event.state === 'connected' || event.state === 'completed'
      if (entry.iceReady) ready(entry)
      else if (event.state === 'disconnected') fail(entry, true)
      else if (event.state === 'failed' || event.state === 'closed') fail(entry)
    } else fail(entry)
  }
  const begin = (presence: VoicePresence, incoming?: VoiceMediaCall): Entry => {
    const previous = entries.get(presence.memberId)
    const failed = previous?.failed ?? false
    if (previous) clear(previous)
    let resolve!: (value: boolean) => void
    const result = new Promise<boolean>((done) => {
      resolve = done
    })
    const entry: Entry = { presence, ready: false, failed, iceReady: false, result, resolve }
    entries.set(presence.memberId, entry)
    entry.timer = setTimeout(() => fail(entry), CALL_SETUP_TIMEOUT_MS)
    try {
      if (incoming) entry.call = incoming
      else if (shouldInitiateVoiceCall(self.memberId, presence.memberId))
        entry.call = port.call(presence.peerId, audio.getOutgoingStream(), {
          version: 1,
          callerSessionId: self.voiceSessionId,
          calleeSessionId: presence.voiceSessionId,
        })
      if (entry.call) {
        entry.unsubscribe = entry.call.subscribe((event) => events(entry, event))
        if (incoming) incoming.answer(audio.getOutgoingStream())
      }
    } catch {
      fail(entry)
    }
    notify()
    return entry
  }
  const unsubscribeIncoming = port.subscribeIncoming((call) => {
    const presence = [...desired.values()].find((p) => p.peerId === call.peerId)
    const metadata = call.metadata as Partial<VoiceCallMetadata> | null
    const previous = presence && entries.get(presence.memberId)
    if (
      disposed ||
      !presence ||
      !shouldInitiateVoiceCall(presence.memberId, self.memberId) ||
      !metadata ||
      metadata.version !== 1 ||
      metadata.callerSessionId !== presence.voiceSessionId ||
      metadata.calleeSessionId !== self.voiceSessionId ||
      (previous?.call && !previous.failed)
    ) {
      call.close()
      return
    }
    begin(presence, call)
  })
  return {
    reconcile(roster) {
      if (disposed) return
      desired = new Map(
        roster.filter((p) => p.memberId !== self.memberId).map((p) => [p.memberId, p]),
      )
      for (const [id, entry] of entries) {
        const next = desired.get(id)
        if (
          !next ||
          next.peerId !== entry.presence.peerId ||
          next.voiceSessionId !== entry.presence.voiceSessionId
        ) {
          retry.cancel(key(entry.presence))
          entries.delete(id)
          clear(entry)
        }
      }
      for (const p of desired.values()) if (!entries.has(p.memberId)) begin(p)
      notify()
    },
    async replaceTrack(track) {
      await Promise.all(
        [...entries.values()].map(async (entry) => {
          if (!entry.call) return
          try {
            await entry.call.replaceTrack(track)
          } catch {
            fail(entry)
          }
        }),
      )
    },
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribeIncoming()
      retry.dispose()
      for (const entry of entries.values()) clear(entry)
      entries.clear()
      desired.clear()
    },
  }
}
