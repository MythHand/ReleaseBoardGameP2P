import { describe, expect, it } from 'vitest'
import { CLIP_MS, ELIM_MIN_MS, ELIMINATION_CLIPS, guardMsFor } from './eliminateBeat'

// The guard is armed with a number this table supplies, so the table has to be
// true about the files. Swap a clip for one of a different length and this test
// fails, instead of the guard silently cutting the new clip short — which
// matters here specifically: the clips ship with unconfirmed rights and are
// expected to be replaced (docs/animations/backlog.md).
//
// The clips reach this test as data URIs (`?inline`), not through `node:fs`:
// this package keeps a browser-only type surface, the same constraint the
// playground's own docs test works around. `atob` gives the bytes back.
const CLIP_BYTES = Object.fromEntries(
  Object.entries(
    import.meta.glob('./eliminate/*.mp4', { eager: true, query: '?inline', import: 'default' }),
  ).map(([path, uri]) => [path.split('/').pop() as string, bytesOf(uri as string)]),
)

function bytesOf(dataUri: string): DataView {
  const b64 = dataUri.slice(dataUri.indexOf(',') + 1)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return new DataView(out.buffer)
}

// Read out of the file itself rather than trusted: ISO-BMFF's `moov/mvhd` box
// carries a timescale and a duration, which is what every player reads too.
// Pure byte-walking, so no media stack is needed in a jsdom run.
function realDurationMs(name: string): number {
  const buf = CLIP_BYTES[name]
  if (!buf) throw new Error(`no bytes for ${name}`)
  const ascii = (p: number) =>
    String.fromCharCode(
      buf.getUint8(p),
      buf.getUint8(p + 1),
      buf.getUint8(p + 2),
      buf.getUint8(p + 3),
    )
  const walk = (start: number, end: number): number | null => {
    let p = start
    while (p + 8 <= end) {
      const size = buf.getUint32(p)
      const type = ascii(p + 4)
      const box = size === 0 ? end - p : size
      if (type === 'moov') return walk(p + 8, p + box)
      if (type === 'mvhd') {
        const version = buf.getUint8(p + 8)
        const o = p + 12 // past version + flags
        // v1 widens the two timestamps and the duration to 64 bits
        return version === 1
          ? (Number(buf.getBigUint64(o + 20)) / buf.getUint32(o + 16)) * 1000
          : (buf.getUint32(o + 12) / buf.getUint32(o + 8)) * 1000
      }
      if (box <= 0) break
      p += box
    }
    return null
  }
  const ms = walk(0, buf.byteLength)
  if (ms == null) throw new Error(`no mvhd in ${name}`)
  return ms
}

const nameOf = (url: string) => url.split('/').pop() as string

describe('the elimination clips and the times the guard trusts', () => {
  it('has a time for every clip that ships, and ships every clip it has a time for', () => {
    expect(ELIMINATION_CLIPS.length).toBeGreaterThan(0)
    expect(ELIMINATION_CLIPS.map(nameOf).sort()).toEqual(Object.keys(CLIP_MS).sort())
  })

  it('states each clip’s real length, read out of the file', () => {
    for (const url of ELIMINATION_CLIPS) {
      const name = nameOf(url)
      // within a frame at 30fps — the table is written in whole ms and the
      // container's own rounding is not worth chasing
      expect(Math.abs(CLIP_MS[name] - realDurationMs(name))).toBeLessThan(34)
    }
  })

  // The rule the guard is derived from, and the one the source already plays by:
  // loop until the floor is reached, then let the pass you are in finish. So the
  // last frame a legitimate clip can show is the first whole multiple of its own
  // length at or past the floor — the guard fires just after that and never
  // during playback.
  it('derives each guard as the first whole loop at or past the floor', () => {
    for (const url of ELIMINATION_CLIPS) {
      const d = CLIP_MS[nameOf(url)]
      const guard = guardMsFor(url)
      expect(guard).toBe(Math.ceil(ELIM_MIN_MS / d) * d)
      expect(guard).toBeGreaterThanOrEqual(ELIM_MIN_MS)
      // it is a whole number of passes, never a cut mid-clip
      expect((Math.round((guard / d) * 1000) / 1000) % 1).toBe(0)
    }
  })

  // The four the reviewer settled on (#126), pinned as values rather than as a
  // formula — if the formula and the intent ever part company, this says so.
  it('comes out at the times the decision named', () => {
    const byName = Object.fromEntries(
      ELIMINATION_CLIPS.map((u) => [nameOf(u), Math.round(guardMsFor(u))]),
    )
    expect(byName).toEqual({
      'freshleb-whistlindiesel.mp4': 6102,
      'doc_2026-07-31_23-09-35.mp4': 6534,
      'gato-truco-gato.mp4': 6467,
      'IHa0T7Ffr43z1kTd.mp4': 9400,
    })
  })
})
