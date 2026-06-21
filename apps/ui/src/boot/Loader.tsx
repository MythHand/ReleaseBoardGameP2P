// Лоадер игры (порт из user_input/Loader). Самостоятельный декоративный boot-экран:
// blank → terminal → blank → logo (frame → fill flash → split+shake → reassemble → hold → fade) → restart.
import { useCallback, useEffect, useRef, useState } from 'react'
import LogoSvg from './Logo'
import LoaderAudio from './audio'
import { buildSequence } from './lines'
import './boot.css'

// ---------------- Terminal ----------------
interface TerminalProps {
  active: boolean
  onComplete: () => void
}

function Terminal({ active, onComplete }: TerminalProps) {
  const [lines, setLines] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return
    const sequence = buildSequence()
    let i = 0
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    function emitOne(): boolean {
      if (cancelled) return false
      if (i >= sequence.length) return true
      const line = sequence[i++]
      setLines((prev) => [...prev, line])
      if (line.trim() !== '') LoaderAudio.tickThink()
      return false
    }

    function step() {
      if (cancelled) return
      const r = Math.random()
      if (r < 0.5) {
        const n = 4 + Math.floor(Math.random() * 7)
        let k = 0
        function burstStep() {
          if (cancelled) return
          const done = emitOne()
          k++
          if (done) {
            schedule(360 + Math.random() * 280)
            return
          }
          if (k >= n) {
            schedule(60 + Math.random() * 160)
            return
          }
          timer = setTimeout(burstStep, 6 + Math.random() * 18)
        }
        burstStep()
      } else if (r < 0.8) {
        const done1 = emitOne()
        if (done1) {
          schedule(360)
          return
        }
        timer = setTimeout(
          () => {
            if (cancelled) return
            const done2 = emitOne()
            if (done2) {
              schedule(360)
              return
            }
            schedule(40 + Math.random() * 140)
          },
          40 + Math.random() * 100,
        )
      } else if (r < 0.94) {
        timer = setTimeout(
          () => {
            if (cancelled) return
            const done = emitOne()
            schedule(done ? 360 : 30 + Math.random() * 100)
          },
          320 + Math.random() * 420,
        )
      } else {
        timer = setTimeout(
          () => {
            if (cancelled) return
            const done = emitOne()
            schedule(done ? 360 : 30 + Math.random() * 100)
          },
          700 + Math.random() * 600,
        )
      }
    }

    function schedule(ms: number) {
      if (cancelled) return
      if (i >= sequence.length) {
        timer = setTimeout(() => !cancelled && onComplete(), 600)
        return
      }
      timer = setTimeout(step, ms)
    }

    step()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [active, onComplete])

  // biome-ignore lint/correctness/useExhaustiveDependencies: lines triggers scroll-to-bottom; containerRef is a ref (stable)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <div className="terminal" ref={containerRef}>
      <div className="terminal-inner">
        {lines.map((l, i) => (
          <div className="line" key={i}>
            {l === '' ? ' ' : l}
          </div>
        ))}
        <div className="line cursor-line">
          <span className="cursor" />
        </div>
      </div>
    </div>
  )
}

// ---------------- Logo stage ----------------
interface LogoStageProps {
  active: boolean
  onComplete: () => void
}

function LogoStage({ active, onComplete }: LogoStageProps) {
  const [fillOverlay, setFillOverlay] = useState(0)
  const [splitOffset, setSplitOffset] = useState(0)
  const [glitchY, setGlitchY] = useState(0)
  const [frameOpacity, setFrameOpacity] = useState(0)
  const [logoOpacity, setLogoOpacity] = useState(0)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    let raf = 0
    const T = (fn: () => void, ms: number) => timers.push(setTimeout(() => !cancelled && fn(), ms))

    const T_FRAME_ONLY = 540
    const T_FILL_RAMP_END = 710
    const T_FILL_OFF = 850
    const T_SLAM = 1600
    const T_HOLD_AFTER_SLAM = 2400
    const T_FADE_OUT = 320

    setFrameOpacity(1)
    setLogoOpacity(1)
    LoaderAudio.playTheme()

    const rampStart = T_FRAME_ONLY
    const rampDur = T_FILL_RAMP_END - T_FRAME_ONLY
    const rampT0 = performance.now() + rampStart
    function rampFill(now: number) {
      if (cancelled) return
      const elapsed = now - rampT0
      if (elapsed < 0) {
        raf = requestAnimationFrame(rampFill)
        return
      }
      const k = Math.min(1, elapsed / rampDur)
      setFillOverlay(k)
      if (k < 1) raf = requestAnimationFrame(rampFill)
      else setFillOverlay(1)
    }
    raf = requestAnimationFrame(rampFill)

    T(() => {
      setFillOverlay(0)
      const t0 = performance.now()
      const splitDur = T_SLAM - T_FILL_OFF
      const targetOffset = 100
      function shake(now: number) {
        if (cancelled) return
        const elapsed = now - t0
        if (elapsed >= splitDur) return
        const k = Math.min(1, elapsed / splitDur)
        const stepped = Math.floor(k * 6) / 6
        const baseX = targetOffset * stepped
        const jitterX = (Math.random() - 0.5) * 36
        const snapChance = Math.random() < 0.18
        const snapX = snapChance ? (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 30) : 0
        setSplitOffset(baseX + jitterX + snapX)
        setGlitchY(0)
        setFrameOpacity(0)
        raf = requestAnimationFrame(shake)
      }
      raf = requestAnimationFrame(shake)
    }, T_FILL_OFF)

    T(() => {
      if (raf) cancelAnimationFrame(raf)
      setSplitOffset(0)
      setGlitchY(0)
      setFrameOpacity(1)
    }, T_SLAM)

    const fadeStart = T_SLAM + T_HOLD_AFTER_SLAM
    T(() => {
      setLogoOpacity(0)
      setFrameOpacity(0)
    }, fadeStart)

    T(() => onComplete(), fadeStart + T_FADE_OUT)

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [active, onComplete])

  if (!active) return null

  return (
    <div className="logo-stage">
      <div className="logo-wrap" style={{ opacity: logoOpacity }}>
        <div className="logo-frame" style={{ opacity: frameOpacity }} />
        {fillOverlay > 0 && <div className="logo-fill" style={{ opacity: fillOverlay }} />}
        <div className="logo-svg-wrap">
          <LogoSvg
            fillOverlay={0}
            splitOffset={splitOffset}
            glitchY={glitchY}
            color="#ffffff"
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------- Restart screen ----------------
interface RestartScreenProps {
  onRestart: () => void
}

function RestartScreen({ onRestart }: RestartScreenProps) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 80)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className={`restart-screen ${shown ? 'shown' : ''}`}>
      <button type="button" className="restart-btn" onClick={onRestart}>
        <span className="bracket-l">[</span>
        <span className="restart-label">REBOOT</span>
        <span className="bracket-r">]</span>
      </button>
      <div className="restart-hint">press to replay loader</div>
    </div>
  )
}

// ---------------- Audio toggle ----------------
function AudioToggle() {
  const [muted, setMuted] = useState(false)
  function toggle() {
    const next = !muted
    setMuted(next)
    LoaderAudio.setMuted(next)
  }
  return (
    <button type="button" className="audio-toggle" onClick={toggle} aria-label="toggle audio">
      {muted ? 'audio: off' : 'audio: on'}
    </button>
  )
}

type LoaderStage = 'idle' | 'blank0' | 'terminal' | 'blank1' | 'logo' | 'blank2' | 'done'

// ---------------- App / state machine ----------------
function App() {
  const [stage, setStage] = useState<LoaderStage>('idle')
  const [runId, setRunId] = useState(0)
  const [armed, setArmed] = useState(false)

  const start = useCallback(() => {
    LoaderAudio.resume()
    setArmed(true)
    setStage('blank0')
    setTimeout(() => setStage('terminal'), 380)
  }, [])

  const restart = useCallback(() => {
    setRunId((n) => n + 1)
    setStage('blank0')
    setTimeout(() => setStage('terminal'), 380)
  }, [])

  const onTerminalDone = useCallback(() => {
    setStage('blank1')
    setTimeout(() => setStage('logo'), 280)
  }, [])

  const onLogoDone = useCallback(() => {
    setStage('blank2')
    setTimeout(() => setStage('done'), 220)
  }, [])

  return (
    <div className="root" key={runId}>
      {!armed && stage === 'idle' && (
        <button type="button" className="start-gate" onClick={start}>
          <span>
            <span className="bracket-l">[</span> POWER ON <span className="bracket-r">]</span>
          </span>
          <div className="start-hint">click to enable sound &amp; boot</div>
        </button>
      )}

      {stage === 'terminal' && <Terminal active={true} onComplete={onTerminalDone} />}

      <LogoStage active={stage === 'logo'} onComplete={onLogoDone} />

      {stage === 'done' && <RestartScreen onRestart={restart} />}

      {armed && <AudioToggle />}
    </div>
  )
}

// Самостоятельный модуль: оборачиваем в .boot (скоуп стилей).
export default function Loader() {
  return (
    <div className="boot">
      <App />
    </div>
  )
}
