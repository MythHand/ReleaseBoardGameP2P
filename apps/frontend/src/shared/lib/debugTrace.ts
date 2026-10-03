// THE BOARD'S OWN DIARY, for the debug stand's recorder (#168). What the board
// sends out and what the engine answers the stand sees for itself; what happens
// in between — the step the gesture is at, why a cancel ran, which beat holds
// the table — lives inside the board, and this is where it is said out loud.
//
// The game never listens: with no sink set, `trace` returns at once. The stand
// sets a sink while it records, so the board's own lines land in the same log
// as the actions and the engine's answers, in the order they happened.

export type TraceSink = (kind: string, data: Record<string, unknown>) => void

let sink: TraceSink | null = null

export function setTraceSink(next: TraceSink | null): void {
  sink = next
}

export function trace(kind: string, data: Record<string, unknown> = {}): void {
  sink?.(kind, data)
}

/** Whether anyone is listening — for a line whose data costs something to gather. */
export function tracing(): boolean {
  return sink !== null
}

/** The few frames that called the caller, without the server's address: who asked
 *  for it, read off the stack, so no call site has to say why it called. */
export function callers(depth = 4): string[] {
  return (new Error().stack ?? '')
    .split('\n')
    .slice(3, 3 + depth)
    .map((line) =>
      line
        .trim()
        .replace(/^at /, '')
        .replace(/https?:\/\/[^/]+\//, '')
        .replace(/\?[^:)]*/, ''),
    )
}
