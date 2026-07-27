import { useEffect, useState } from 'react'
import Button from '@/primitives/Button'
import Overlay from '@/primitives/Overlay'
import Typography from '@/primitives/Typography'
import styles from './Reconnect.module.css'

// Text — via props (i18n-agnostic); comes from the central catalog. The command
// log below is technical CLI output (generated, English) and is intentionally
// not translated; the human-facing labels (header + actions + abort prompt) are.
export interface ReconnectCopy {
  label: string
  retry: string
  leave: string
  confirmLeave: string
  cancel: string
  abortPrompt: string
}

interface ReconnectProps {
  copy: ReconnectCopy
  // Room address (host peer id) shown in the header. PROTOTYPE: the stream and
  // this default are mocked until the session feeds the real code + attempt state.
  host?: string
  maxAttempts?: number
}

// One line plus the pause (ms) before it appears. A real terminal emits in bursts
// with pauses, and stalls where the client is actually waiting.
interface Beat {
  text: string
  wait: number
}

// Jitter so no two runs (or attempts) tick identically.
function r(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min))
}

// One reconnect run as paced command lines — mocked, but shaped like the real
// process: re-dial the host, open a datachannel, await a handshake, fail, back
// off, retry, give up. Bursts (tiny waits) + stalls (handshake timeout, back-off)
// give the cadence of a live terminal.
function buildScript(host: string, maxAttempts: number): Beat[] {
  const seq: Beat[] = [
    { text: '$ link to host lost', wait: r(80, 160) },
    { text: `$ target ${host}`, wait: r(10, 40) },
    { text: '', wait: r(140, 260) },
  ]
  for (let n = 1; n <= maxAttempts; n++) {
    seq.push({ text: `> attempt ${n}/${maxAttempts} · dialing ${host}`, wait: r(200, 420) })
    seq.push({ text: '  · opening datachannel', wait: r(8, 30) })
    seq.push({ text: '  · awaiting handshake', wait: r(8, 40) })
    seq.push({ text: '  × no answer — peer-unavailable', wait: r(650, 1050) })
    if (n < maxAttempts) {
      seq.push({ text: '> backing off…', wait: r(120, 240) })
      seq.push({ text: '', wait: r(900, 1500) })
    }
  }
  seq.push({ text: '', wait: r(240, 420) })
  seq.push({ text: '× reconnect failed — host unreachable', wait: r(260, 460) })
  return seq
}

// Reconnect window over the table: a fixed-size terminal that streams the live
// reconnection process. It exists ONLY while the link is broken — there is no
// "connected" state here; success dismisses it (Table stops rendering it).
export default function Reconnect({ copy, host = 'ABC-DEF', maxAttempts = 5 }: ReconnectProps) {
  const [run, setRun] = useState(0)
  const [lines, setLines] = useState<{ id: number; text: string }[]>([])
  const [failed, setFailed] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)

  // Reveal the log line-by-line so the window reads as a live process. Restarts
  // whenever `run` changes (a manual reconnect press).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `run` is the restart trigger, used only as a dependency
  useEffect(() => {
    const script = buildScript(host, maxAttempts)
    setLines([])
    setFailed(false)
    let shown = 0
    let timer: ReturnType<typeof setTimeout>
    const step = () => {
      shown += 1
      setLines(script.slice(0, shown).map((b, idx) => ({ id: idx, text: b.text })))
      if (shown < script.length) timer = setTimeout(step, script[shown].wait)
      else setFailed(true)
    }
    timer = setTimeout(step, script[0].wait)
    return () => clearTimeout(timer)
  }, [host, maxAttempts, run])

  return (
    <Overlay className={styles.over}>
      <div className={styles.window} data-tone={failed ? 'failed' : 'trying'}>
        <div className={styles.head}>
          <span className={styles.dot} aria-hidden="true" />
          <Typography base="mono-xs" tk="tk-10" as="span" className={styles.headLabel}>
            {copy.label}
          </Typography>
          <Typography base="mono-xs" tk="tk-10" as="span" className={styles.headAddr}>
            {host}
          </Typography>
        </div>

        <div className={styles.log}>
          {lines.map(({ id, text }) => (
            <Typography
              key={id}
              base="mono-md"
              tk="tk-10"
              as="div"
              className={text.trimStart().startsWith('×') ? styles.lineErr : styles.line}
            >
              {text === '' ? ' ' : text}
            </Typography>
          ))}
          {!failed && (
            <div className={styles.cursorLine}>
              <span className={styles.cursor} aria-hidden="true" />
            </div>
          )}
        </div>

        {confirmLeave ? (
          <div className={styles.foot}>
            <Typography base="mono-md" tk="tk-10" as="div" className={styles.confirmQ}>
              {copy.abortPrompt}
            </Typography>
            <div className={styles.actions}>
              <Button variant="primary" onClick={() => setConfirmLeave(false)}>
                {copy.confirmLeave}
              </Button>
              <Button variant="primary" onClick={() => setConfirmLeave(false)}>
                {copy.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.foot}>
            <div className={styles.actions}>
              <Button variant="primary" onClick={() => setRun((n) => n + 1)}>
                {copy.retry}
              </Button>
              <Button variant="primary" onClick={() => setConfirmLeave(true)}>
                {copy.leave}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Overlay>
  )
}
