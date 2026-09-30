import type { MediaConnection, Peer } from 'peerjs'
import { routeMediaError } from './mediaErrors'
import type { VoiceMediaCall, VoiceMediaEvent, VoiceMediaPort } from './mediaTypes'

export interface PeerMediaPort extends VoiceMediaPort {
  handlePeerError(error: { type?: string; message: string }): boolean
}
export function createMediaPort(peer: Peer, dataDialPeers: ReadonlySet<string>): PeerMediaPort {
  const incoming = new Set<(call: VoiceMediaCall) => void>()
  const active = new Set<{ peerId: string; fail(error: unknown): void; call: VoiceMediaCall }>()
  // Keep dial targets until transport disposal so a late broker expiry stays scoped.
  const targets = new Map<string, (error: unknown) => void>()
  let disposed = false
  const wrap = (connection: MediaConnection): VoiceMediaCall => {
    let closed = false
    let pc: RTCPeerConnection | undefined
    let lastStream: MediaStream | undefined
    const listeners = new Set<(event: VoiceMediaEvent) => void>()
    const emit = (event: VoiceMediaEvent) => {
      if (!closed) for (const listener of [...listeners]) listener(event)
    }
    const ice = () => {
      if (pc) emit({ type: 'ice', state: pc.iceConnectionState })
    }
    const attachIce = () => {
      if (pc === connection.peerConnection) return
      pc?.removeEventListener('iceconnectionstatechange', ice)
      pc = connection.peerConnection
      pc?.addEventListener('iceconnectionstatechange', ice)
    }
    const stream = (value: MediaStream) => {
      lastStream = value
      emit({ type: 'stream', stream: value })
    }
    const error = (value: unknown) => emit({ type: 'error', error: value })
    const closedEvent = () => {
      emit({ type: 'closed' })
      retire()
    }
    const retire = () => {
      if (closed) return
      closed = true
      listeners.clear()
      pc?.removeEventListener('iceconnectionstatechange', ice)
      connection.off('stream', stream)
      connection.off('error', error)
      connection.off('close', closedEvent)
      active.delete(entry)
    }
    const call: VoiceMediaCall = {
      id: connection.connectionId,
      peerId: connection.peer,
      metadata: connection.metadata,
      answer(value) {
        if (!closed) {
          connection.answer(value)
          attachIce()
        }
      },
      async replaceTrack(track) {
        if (closed) throw new Error('Media call closed')
        const sender = connection.peerConnection
          ?.getSenders()
          .find((candidate) => candidate.track?.kind === 'audio')
        if (!sender) throw new Error('Audio sender missing')
        await sender.replaceTrack(track)
      },
      subscribe(listener) {
        if (closed) {
          listener({ type: 'closed' })
          return () => {}
        }
        listeners.add(listener)
        if (lastStream) listener({ type: 'stream', stream: lastStream })
        return () => {
          listeners.delete(listener)
        }
      },
      close() {
        if (!closed) {
          retire()
          connection.close()
        }
      },
    }
    const entry = { peerId: connection.peer, fail: error, call }
    active.add(entry)
    connection.on('stream', stream)
    connection.on('error', error)
    connection.on('close', closedEvent)
    attachIce()
    return call
  }
  const onIncoming = (connection: MediaConnection) => {
    if (disposed) {
      connection.close()
      return
    }
    const call = wrap(connection)
    if (incoming.size > 0) for (const listener of [...incoming]) listener(call)
    else call.close()
  }
  peer.on('call', onIncoming)
  return {
    call(peerId, stream, metadata) {
      if (disposed || peer.destroyed || peer.disconnected)
        throw new Error('Peer unavailable for media')
      const connection = peer.call(peerId, stream, { metadata })
      if (!connection) throw new Error('PeerJS did not create a media call')
      const call = wrap(connection)
      targets.set(peerId, (error) => {
        for (const entry of [...active]) if (entry.peerId === peerId) entry.fail(error)
      })
      return call
    },
    subscribeIncoming(listener) {
      incoming.add(listener)
      return () => {
        incoming.delete(listener)
      }
    },
    handlePeerError(error) {
      return routeMediaError(error, dataDialPeers, targets)
    },
    close() {
      if (disposed) return
      disposed = true
      peer.off('call', onIncoming)
      incoming.clear()
      for (const entry of [...active]) entry.call.close()
      targets.clear()
    },
  }
}
