// The avatar this person last picked, offered to the host as a wish on every
// join. `localStorage`, unlike every record in persistence.ts: those describe
// one PEER and must not leak between tabs, while this is a preference of the
// PERSON and has to outlive the tab. Two tabs sharing it is harmless — the host
// grants a wish only while it is free, so the second tab gets another avatar.
const KEY = 'release:avatar'

// Storage can throw (Safari private mode); the preference then lives for the
// page's lifetime only.
let memory: string | null = null

export function readAvatarPreference(): string | null {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored !== null) return stored
  } catch {
    // fall through to memory
  }
  return memory
}

export function writeAvatarPreference(id: string): void {
  memory = id
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // memory already holds it
  }
}

export function clearAvatarPreference(): void {
  memory = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    // memory is already clear
  }
}
