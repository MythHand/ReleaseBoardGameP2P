import type { AccessResult, PermissionService } from '~/shared/lib/permissions'
import { withPermission } from '~/shared/lib/permissions'
import type { Transport } from '../transport/peer'
import type { PeerInfo, WireMessage } from '../types'
import { clampVolume, type ParticipantAudioSettings, type VoiceAudio } from './audio'
import {
  applyVoiceIntent,
  createVoiceAuthority,
  pruneVoiceAuthority,
  type VoiceAuthority,
} from './authority'
import { createVoiceCalls, type VoiceCalls, type VoiceCallsState } from './calls'
import { parseVoiceFrame } from './protocol'
import { CALL_SETUP_TIMEOUT_MS } from './reconnect'
import type { VoiceIntent, VoicePresence, VoiceRosterPayload } from './types'

export type VoiceIssue =
  | 'microphoneDenied'
  | 'microphoneMissing'
  | 'permissionUnsupported'
  | 'permissionTimeout'
  | 'captureFailed'
  | 'audioBlocked'
  | 'callFailed'
  | 'roomDisconnected'
export interface VoiceSnapshot {
  status: 'off' | 'connecting' | 'connected' | 'interrupted'
  micOff: boolean
  roster: VoicePresence[]
  selfMemberId: string | null
  volume: number
  settings: Record<string, ParticipantAudioSettings>
  issue: VoiceIssue | null
}
export interface VoiceRoomContext {
  roomCode: string
  roomGeneration: number
  transportGeneration: number
  transport: Transport
  selfPeerId: string
  selfMemberId: string
  hostPeerId: string
  peers: Record<string, PeerInfo>
  admitted: boolean
}
export interface RoomVoice {
  getSnapshot(): VoiceSnapshot
  subscribe(listener: () => void): () => void
  updateRoom(context: VoiceRoomContext | null): void
  handleMessage(frame: WireMessage): boolean
  connect(): Promise<void>
  disconnect(): void
  setMicOff(off: boolean): Promise<void>
  setVolume(volume: number): void
  setParticipantVolume(id: string, volume: number): void
  setParticipantMuted(id: string, muted: boolean): void
  dispose(): void
}
function captureIssue(result: AccessResult<unknown>): VoiceIssue | null {
  switch (result.status) {
    case 'success':
      return null
    case 'denied':
      return 'microphoneDenied'
    case 'unavailable':
      return 'microphoneMissing'
    case 'unsupported':
      return 'permissionUnsupported'
    case 'timeout':
      return 'permissionTimeout'
    case 'cancelled':
      return null
    default:
      return 'captureFailed'
  }
}
export function createRoomVoice(options: {
  permissions: PermissionService
  createAudio: () => VoiceAudio
  newId: () => string
}): RoomVoice {
  const { permissions } = options
  const listeners = new Set<() => void>()
  let snapshot: VoiceSnapshot = {
    status: 'off',
    micOff: true,
    roster: [],
    selfMemberId: null,
    volume: 100,
    settings: {},
    issue: null,
  }
  let context: VoiceRoomContext | null = null
  let authority: VoiceAuthority | undefined
  let roster: VoiceRosterPayload | undefined
  const retiredAuthorities = new Set<string>()
  let audio: VoiceAudio | undefined
  let calls: VoiceCalls | undefined
  let callState: VoiceCallsState = { readyMemberIds: [], failedMemberIds: [] }
  let captured: MediaStream | undefined
  let releaseEnded: (() => void) | undefined
  let releasePermission: (() => void) | undefined
  let releaseOutput: (() => void) | undefined
  let finishOutput: ((ready: boolean) => void) | undefined
  let micAbort: AbortController | undefined
  let joining: Promise<void> | undefined
  let enabling: Promise<void> | undefined
  let generation = 0
  let micGeneration = 0
  let voiceSessionId: string | undefined
  let joinTimer: ReturnType<typeof setTimeout> | undefined
  let rosterTimedOut = false
  let wanted = false
  let audioReady = false
  let outputPending = false
  let everConnected = false
  let microphoneIssue: VoiceIssue | null = null
  let disposed = false
  const publish = (patch: Partial<VoiceSnapshot>) => {
    if (
      Object.entries(patch).every(([key, value]) =>
        Object.is(snapshot[key as keyof VoiceSnapshot], value),
      )
    )
      return
    snapshot = { ...snapshot, ...patch }
    for (const listener of [...listeners]) listener()
  }
  const clearJoinWait = () => {
    clearTimeout(joinTimer)
    joinTimer = undefined
    rosterTimedOut = false
  }
  const ownPresence = () =>
    context &&
    roster?.participants.find(
      (p) =>
        p.peerId === context?.selfPeerId &&
        p.memberId === context?.selfMemberId &&
        p.voiceSessionId === voiceSessionId,
    )
  const eligible = () =>
    roster?.participants.filter((p) => context?.peers[p.peerId]?.memberId === p.memberId) ?? []
  const refresh = () => {
    if (!wanted) {
      publish({ status: 'off', issue: null })
      return
    }
    const own = ownPresence()
    const expected = eligible().filter((p) => p.memberId !== context?.selfMemberId)
    const failed = callState.failedMemberIds.length > 0
    const allReady = expected.every((p) => callState.readyMemberIds.includes(p.memberId))
    const interrupted =
      !context?.admitted ||
      (!audioReady && !outputPending) ||
      failed ||
      rosterTimedOut ||
      (!own && everConnected)
    const status = interrupted
      ? 'interrupted'
      : own && audioReady && (allReady || everConnected)
        ? 'connected'
        : 'connecting'
    if (status === 'connected') everConnected = true
    publish({
      status,
      issue: context?.admitted
        ? !audioReady && !outputPending
          ? 'audioBlocked'
          : failed || rosterTimedOut || (!own && everConnected)
            ? 'callFailed'
            : microphoneIssue
        : 'roomDisconnected',
    })
  }
  const stopCalls = () => {
    calls?.dispose()
    calls = undefined
    callState = { readyMemberIds: [], failedMemberIds: [] }
  }
  const reconcile = () => {
    const own = ownPresence()
    if (!wanted || !context?.admitted || !audio || !own || !context.transport.media) {
      stopCalls()
      if (wanted && !own) audio?.suspendTransmission()
      refresh()
      return
    }
    if (!calls) {
      const owner = generation
      calls = createVoiceCalls({
        port: context.transport.media,
        audio,
        self: own,
        onState: (state) => {
          if (owner !== generation || !wanted) return
          callState = state
          refresh()
        },
      })
    }
    audio.setMicOff(snapshot.micOff)
    calls.reconcile(eligible())
    refresh()
  }
  const acceptRoster = (next: VoiceRosterPayload) => {
    roster = next
    if (ownPresence()) clearJoinWait()
    publish({ roster: next.participants })
    reconcile()
  }
  const broadcastAuthority = () => {
    if (!context || !authority) return
    if (context.transport.media)
      context.transport.broadcast({ type: 'VOICE_ROSTER', payload: authority.roster })
    acceptRoster(authority.roster)
  }
  const intent = (message: VoiceIntent) => {
    if (!context?.admitted) return
    if (context.selfPeerId === context.hostPeerId && authority) {
      const next = applyVoiceIntent(
        authority,
        { ...message, from: context.selfPeerId, seq: 0 },
        context.peers,
      )
      if (next !== authority) {
        authority = next
        broadcastAuthority()
      }
    } else context.transport.send(context.hostPeerId, message)
  }
  const announce = () => {
    if (!wanted || !voiceSessionId || !context?.admitted) return
    intent({ type: 'VOICE_JOIN', payload: { voiceSessionId, micOff: snapshot.micOff } })
    if (!ownPresence() && joinTimer === undefined && !rosterTimedOut) {
      const owner = generation
      joinTimer = setTimeout(() => {
        joinTimer = undefined
        if (owner !== generation || !wanted) return
        rosterTimedOut = true
        refresh()
      }, CALL_SETUP_TIMEOUT_MS)
    }
  }
  const sendMic = () => {
    if (wanted && voiceSessionId)
      intent({ type: 'VOICE_MIC', payload: { voiceSessionId, micOff: snapshot.micOff } })
  }
  const releaseCapture = () => {
    releaseEnded?.()
    releaseEnded = undefined
    if (captured) permissions.release('microphone', captured)
    captured = undefined
  }
  const loseCapture = () => {
    micAbort?.abort()
    micGeneration++
    const track = audio?.setMicrophone(null)
    releaseCapture()
    publish({ micOff: true })
    microphoneIssue = 'microphoneMissing'
    if (track) void calls?.replaceTrack(track)
    sendMic()
    refresh()
  }
  const acquire = (): Promise<void> => {
    const ownerGeneration = generation
    const captureGeneration = ++micGeneration
    micAbort?.abort()
    const controller = new AbortController()
    micAbort = controller
    const guarded = withPermission(permissions, 'microphone', (stream) => {
      if (
        generation !== ownerGeneration ||
        captureGeneration !== micGeneration ||
        !wanted ||
        !context?.admitted ||
        !audio
      )
        throw new Error('Capture owner retired')
      const track = stream.getAudioTracks().find((candidate) => candidate.readyState === 'live')
      if (!track) throw new Error('Capture has no live audio track')
      audio.setMicrophone(stream)
      if (captured !== stream) {
        releaseCapture()
        captured = stream
      }
      releaseEnded?.()
      track.addEventListener('ended', loseCapture)
      releaseEnded = () => track.removeEventListener('ended', loseCapture)
      audio.setMicOff(false)
      publish({ micOff: false })
      void calls?.replaceTrack(track)
    })
    return guarded({ existing: captured }, { owner: controller, signal: controller.signal }).then(
      (result) => {
        if (generation !== ownerGeneration || captureGeneration !== micGeneration || !wanted) return
        microphoneIssue = captureIssue(result)
        sendMic()
        refresh()
      },
    )
  }
  const stopVoice = () => {
    wanted = false
    clearJoinWait()
    generation++
    micGeneration++
    micAbort?.abort()
    micAbort = undefined
    finishOutput?.(false)
    finishOutput = undefined
    releasePermission?.()
    releasePermission = undefined
    releaseOutput?.()
    releaseOutput = undefined
    releaseEnded?.()
    releaseEnded = undefined
    stopCalls()
    releaseCapture()
    if (audio) void audio.dispose()
    audio = undefined
    audioReady = false
    outputPending = false
    everConnected = false
    voiceSessionId = undefined
    joining = undefined
    enabling = undefined
    microphoneIssue = null
    publish({ status: 'off', micOff: true, issue: null })
  }
  const disconnect = () => {
    if (voiceSessionId) intent({ type: 'VOICE_LEAVE', payload: { voiceSessionId } })
    stopVoice()
  }
  const runtime: RoomVoice = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    updateRoom(next) {
      if (disposed) return
      const previous = context
      const roomChanged =
        !next ||
        (previous !== null &&
          (next.roomCode !== previous.roomCode || next.roomGeneration !== previous.roomGeneration))
      if (roomChanged) {
        if (roster) retiredAuthorities.add(roster.authorityId)
        disconnect()
        context = null
        authority = undefined
        roster = undefined
        publish({ roster: [], settings: {}, volume: 100, selfMemberId: null })
      }
      context = next
      if (!next) return
      publish({ selfMemberId: next.selfMemberId })
      const changedTransport =
        !previous ||
        roomChanged ||
        previous.transport !== next.transport ||
        previous.transportGeneration !== next.transportGeneration ||
        previous.hostPeerId !== next.hostPeerId ||
        previous.selfPeerId !== next.selfPeerId ||
        previous.selfMemberId !== next.selfMemberId
      if (changedTransport) {
        clearJoinWait()
        if (roster) retiredAuthorities.add(roster.authorityId)
        generation++
        micGeneration++
        micAbort?.abort()
        stopCalls()
        roster = undefined
        authority =
          next.selfPeerId === next.hostPeerId ? createVoiceAuthority(options.newId()) : undefined
        publish({ roster: [] })
        if (wanted) voiceSessionId = options.newId()
      }
      if (!next.admitted) {
        if (previous?.admitted) {
          clearJoinWait()
          generation++
          micGeneration++
          micAbort?.abort()
          finishOutput?.(false)
          stopCalls()
          audio?.suspendTransmission()
        }
        refresh()
        return
      }
      if (authority) {
        authority = pruneVoiceAuthority(authority, next.peers)
        broadcastAuthority()
      }
      if (wanted && (changedTransport || previous?.admitted === false)) {
        if (!changedTransport) {
          generation++
          voiceSessionId = options.newId()
          stopCalls()
        }
        audio?.setMicOff(snapshot.micOff)
        announce()
      }
      reconcile()
    },
    handleMessage(frame) {
      if (!frame.type.startsWith('VOICE_')) return false
      const parsed = parseVoiceFrame(frame)
      if (!parsed || !context || disposed) return true
      if (parsed.type === 'VOICE_ROSTER') {
        if (
          !context.admitted ||
          parsed.from !== context.hostPeerId ||
          context.selfPeerId === context.hostPeerId ||
          retiredAuthorities.has(parsed.payload.authorityId)
        )
          return true
        if (
          roster &&
          (roster.authorityId !== parsed.payload.authorityId ||
            parsed.payload.revision <= roster.revision)
        )
          return true
        acceptRoster(parsed.payload)
      } else if (context.selfPeerId === context.hostPeerId && authority && context.admitted) {
        const next = applyVoiceIntent(authority, parsed, context.peers)
        if (next !== authority) {
          authority = next
          broadcastAuthority()
        }
      }
      return true
    },
    connect() {
      if (joining !== undefined) return joining
      if (wanted || disposed || !context?.admitted) return Promise.resolve()
      wanted = true
      generation++
      everConnected = false
      voiceSessionId = options.newId()
      const owner = generation
      publish({ status: 'connecting', micOff: true, issue: null })
      try {
        audio = options.createAudio()
        audio.setMasterVolume(snapshot.volume)
        for (const [id, setting] of Object.entries(snapshot.settings))
          audio.setParticipant(id, setting)
        outputPending = true
        const ownedAudio = audio
        releaseOutput = audio.subscribeState((ready) => {
          if (audio !== ownedAudio || !wanted) return
          audioReady = ready
          refresh()
        })
        releasePermission = permissions.observe('microphone', (state) => {
          if (wanted && state === 'denied') loseCapture()
        })
        const output = new Promise<boolean>((resolve) => {
          let done = false
          const timer = setTimeout(() => finish(false), 30000)
          const finish = (ready: boolean) => {
            if (done) {
              if (ready && audio === ownedAudio && wanted) {
                audioReady = true
                refresh()
              }
              return
            }
            done = true
            clearTimeout(timer)
            if (audio === ownedAudio && wanted) {
              outputPending = false
              audioReady = ready
              refresh()
            }
            resolve(ready)
          }
          finishOutput = finish
          audio?.resume().then(
            () => finish(true),
            () => finish(false),
          )
        })
        const capture = acquire()
        const work = Promise.all([output, capture])
          .then(([ready]) => {
            if (owner !== generation || !wanted) return
            audioReady = ready
            announce()
            reconcile()
          })
          .finally(() => {
            if (joining === work) joining = undefined
          })
        joining = work
        return work
      } catch {
        outputPending = false
        audioReady = false
        refresh()
        return Promise.resolve()
      }
    },
    disconnect,
    setMicOff(off) {
      if (!wanted || !audio) return Promise.resolve()
      if (off) {
        micGeneration++
        micAbort?.abort()
        enabling = undefined
        audio.setMicOff(true)
        publish({ micOff: true })
        sendMic()
        refresh()
        const existing = captured
        if (!existing?.getAudioTracks().some((track) => track.readyState === 'live'))
          return Promise.resolve()
        const owner = generation
        const muteGeneration = micGeneration
        const mute = withPermission(permissions, 'microphone', () => {
          if (owner === generation && muteGeneration === micGeneration && captured === existing)
            audio?.setMicOff(true)
        })
        return mute({ existing }, { owner: {} }).then(() => {})
      }
      if (!context?.admitted) return Promise.resolve()
      if (enabling !== undefined) return enabling
      const work = acquire().finally(() => {
        if (enabling === work) enabling = undefined
      })
      enabling = work
      return work
    },
    setVolume(volume) {
      const value = clampVolume(volume)
      audio?.setMasterVolume(value)
      publish({ volume: value })
    },
    setParticipantVolume(id, volume) {
      const value = {
        ...(snapshot.settings[id] ?? { volume: 100, muted: false }),
        volume: clampVolume(volume),
      }
      audio?.setParticipant(id, value)
      publish({ settings: { ...snapshot.settings, [id]: value } })
    },
    setParticipantMuted(id, muted) {
      const value = { ...(snapshot.settings[id] ?? { volume: 100, muted: false }), muted }
      audio?.setParticipant(id, value)
      publish({ settings: { ...snapshot.settings, [id]: value } })
    },
    dispose() {
      if (disposed) return
      runtime.updateRoom(null)
      disposed = true
      listeners.clear()
    },
  }
  return runtime
}
