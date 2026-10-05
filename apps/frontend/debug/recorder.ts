import { useCallback, useEffect, useRef, useState } from 'react'
import { setTraceSink } from '~/shared/lib/debugTrace'
import { watchScreen } from './screen'

// THE STAND'S RECORDER (#168). One log, in the order things happened: what the
// stand sent the engine and what it answered (`from: 'stand'`), what the board
// said of itself in between — what it draws, its gestures, its beats (`from:
// 'board'`, through `debugTrace`) — and what the page actually showed, on every
// painted frame that differed (`from: 'screen'`). Saved as a file to be read
// later, line by line, instead of being remembered from what the eye caught.
//
// Nothing re-renders while it records. Every line goes into a ref; the count is
// read once, on stop. A recorder that re-rendered the page per line would move
// the very frames it is there to catch.

export interface LogEntry {
  t: number // ms since the recording started
  from: 'stand' | 'board' | 'screen'
  kind: string
  // what the line says, kept apart so no field of it can stand in for the three above
  data: Record<string, unknown>
}

export interface Recorder {
  recording: boolean
  /** lines held, as of the last stop */
  count: number
  /** where the last save put the file in the project, until the next recording */
  saved: string | null
  start: () => void
  stop: () => void
  save: (name: string) => void
  note: (kind: string, data?: Record<string, unknown>) => void
}

export function useRecorder(): Recorder {
  const entries = useRef<LogEntry[]>([])
  const startedAt = useRef(0)
  const on = useRef(false)
  const [recording, setRecording] = useState(false)
  const [count, setCount] = useState(0)
  const [saved, setSaved] = useState<string | null>(null)

  const push = useCallback(
    (from: LogEntry['from'], kind: string, data: Record<string, unknown> = {}) => {
      if (!on.current) return
      const t = Math.round((performance.now() - startedAt.current) * 10) / 10
      entries.current.push({ t, from, kind, data })
    },
    [],
  )
  const unwatch = useRef<(() => void) | null>(null)

  const start = useCallback(() => {
    entries.current = []
    startedAt.current = performance.now()
    on.current = true
    setTraceSink((kind, data) => push('board', kind, data))
    unwatch.current = watchScreen((frame) => push('screen', 'screen', { ...frame }))
    setRecording(true)
    setSaved(null)
  }, [push])

  const stop = useCallback(() => {
    on.current = false
    setTraceSink(null)
    unwatch.current?.()
    unwatch.current = null
    setRecording(false)
    setCount(entries.current.length)
  }, [])

  // Into the project through the dev server (`debugLogSink` in vite.config.ts),
  // where whoever works on the board can read it. A download only when there is
  // no dev server to take it.
  const save = useCallback((name: string) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const file = `board-log-${name}-${stamp}.json`
    const body = JSON.stringify(
      { savedAt: new Date().toISOString(), entries: entries.current },
      null,
      2,
    )
    const download = () => {
      const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = file
      link.click()
      URL.revokeObjectURL(url)
    }
    fetch(`/__debug/log?name=${encodeURIComponent(file)}`, { method: 'POST', body })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        setSaved(await res.text())
      })
      .catch(download)
  }, [])

  const note = useCallback(
    (kind: string, data: Record<string, unknown> = {}) => push('stand', kind, data),
    [push],
  )

  // the board is not left talking to a recorder that is gone, nor the page watched
  useEffect(
    () => () => {
      setTraceSink(null)
      unwatch.current?.()
    },
    [],
  )

  return { recording, count, saved, start, stop, save, note }
}
