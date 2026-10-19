// Safari private mode and some embedded webviews throw on both getItem and
// setItem. A browser without storage then behaves exactly as the app did
// before any of this existed — it simply cannot restore — rather than
// crashing on mount.
const memory = new Map<string, string>()

// `sessionStorage`, not `localStorage`, and that choice is load-bearing.
//
// Every record here describes ONE PEER: who this browser is at the table, which
// room it is in, and (for a host) the match it is keeping. localStorage is
// per-ORIGIN, so two tabs of the same app share one copy of all of it and the
// last writer wins. Open a host in one tab and a guest in another — the obvious
// way to play or test locally — and the guest's record overwrites the host's.
// The host then reloads, reads "you are a guest", declines its own restore, and
// starts dialling its own room code: a peer that no longer exists, because it is
// the one that just reloaded. The player watches "link to host lost" forever
// over an empty board. That is not a theoretical collision; it is the reported
// bug, reproduced in a real browser.
//
// sessionStorage is scoped to the TAB, and survives exactly what has to be
// survived: a reload, a crash-restore, and in-tab navigation. Two tabs get two
// identities, which is what two peers are.
//
// What this gives up: closing the tab and reopening it no longer offers the
// match back, because the record went with the tab. That is the smaller loss —
// it trades a rarer convenience for the common case working at all.
function store(): Storage | null {
  try {
    return sessionStorage
  } catch {
    return null
  }
}

export function read(key: string): string | null {
  try {
    const stored = store()?.getItem(key)
    if (stored !== null && stored !== undefined) return stored
  } catch {
    // fall through to memory
  }
  return memory.get(key) ?? null
}

export function write(key: string, value: string): void {
  memory.set(key, value)
  try {
    store()?.setItem(key, value)
  } catch {
    // memory already holds it
  }
}

export function remove(key: string): void {
  memory.delete(key)
  try {
    store()?.removeItem(key)
  } catch {
    // memory is already clear
  }
}

export function readJson<T>(key: string): T | null {
  const raw = read(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    // A record we cannot parse is a record we cannot trust. Drop it rather
    // than leave it to fail the same way on every future load.
    remove(key)
    return null
  }
}

