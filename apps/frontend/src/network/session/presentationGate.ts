export const BOT_ACTION_MS = 2000
export const PRESENTATION_CAP_MS = 12000

export interface PresentationId {
  gameId: string
  incarnation: string
  revision: number
}
export interface PresentationWait {
  id: PresentationId
  issuedAt: number
  deadline: number
  waitingPeers: string[]
}
export interface PresentationRuntime {
  incarnation: string
  revision: number
  wait: PresentationWait | null
  botNotBefore: number
}

export function beginPresentation(
  runtime: PresentationRuntime,
  gameId: string,
  peers: string[],
  now: number,
): PresentationRuntime {
  const revision = runtime.revision + 1
  return {
    ...runtime,
    revision,
    botNotBefore: now + BOT_ACTION_MS,
    wait: {
      id: { gameId, incarnation: runtime.incarnation, revision },
      issuedAt: now,
      deadline: now + PRESENTATION_CAP_MS,
      waitingPeers: [...new Set(peers)],
    },
  }
}

export function samePresentation(a: PresentationId, b: PresentationId): boolean {
  return a.gameId === b.gameId && a.incarnation === b.incarnation && a.revision === b.revision
}

export function ackPresentation(
  runtime: PresentationRuntime,
  peerId: string,
  id: PresentationId,
): PresentationRuntime {
  if (!runtime.wait || !samePresentation(runtime.wait.id, id)) return runtime
  return dropPresentationPeer(runtime, peerId)
}

export function dropPresentationPeer(
  runtime: PresentationRuntime,
  peerId: string,
): PresentationRuntime {
  if (!runtime.wait?.waitingPeers.includes(peerId)) return runtime
  return {
    ...runtime,
    wait: {
      ...runtime.wait,
      waitingPeers: runtime.wait.waitingPeers.filter((peer) => peer !== peerId),
    },
  }
}

export function presentationReady(runtime: PresentationRuntime, now: number): boolean {
  return !runtime.wait || runtime.wait.waitingPeers.length === 0 || now >= runtime.wait.deadline
}

export function botReady(runtime: PresentationRuntime, now: number): boolean {
  return now >= runtime.botNotBefore && presentationReady(runtime, now)
}

export function isPresentationId(value: unknown): value is PresentationId {
  if (!value || typeof value !== 'object') return false
  const id = value as Partial<PresentationId>
  return (
    typeof id.gameId === 'string' &&
    typeof id.incarnation === 'string' &&
    Number.isSafeInteger(id.revision) &&
    (id.revision ?? 0) > 0
  )
}

// Stored metadata is untrusted and older snapshots have none. Missing timing
// releases a held presentation rather than awarding a fresh twelve seconds.
export function restorePresentationRuntime(
  saved: unknown,
  gameId: string,
  incarnation: string,
  now: number,
): PresentationRuntime {
  const fallback: PresentationRuntime = {
    incarnation,
    revision: 0,
    wait: null,
    botNotBefore: now + BOT_ACTION_MS,
  }
  if (!saved || typeof saved !== 'object') return fallback
  const value = saved as Partial<PresentationRuntime>
  if (
    !Number.isSafeInteger(value.revision) ||
    (value.revision ?? -1) < 0 ||
    !Number.isFinite(value.botNotBefore)
  )
    return fallback
  if (value.wait === null)
    return {
      ...fallback,
      revision: value.revision as number,
      botNotBefore: value.botNotBefore as number,
    }
  const wait = value.wait
  if (
    !wait ||
    !isPresentationId(wait.id) ||
    wait.id.gameId !== gameId ||
    wait.id.revision !== value.revision ||
    !Number.isFinite(wait.issuedAt) ||
    !Number.isFinite(wait.deadline) ||
    wait.deadline < wait.issuedAt ||
    wait.deadline - wait.issuedAt > PRESENTATION_CAP_MS
  )
    return fallback
  return {
    incarnation,
    revision: value.revision as number,
    botNotBefore: value.botNotBefore as number,
    wait: { ...wait, id: { ...wait.id, incarnation }, waitingPeers: [] },
  }
}
