// Loader audio (порт из user_input/Loader): tickThink() — клик строки;
// playTheme() — тема лого-фазы (~3с). Семплы в assets/audio/.
import toneUrl from '../assets/audio/tone2a.wav'
import themeWavUrl from '../assets/audio/theme.wav'

const LoaderAudio = (function () {
  let ctx = null
  let masterGain = null
  let muted = false

  let tickBuffer = null
  let tickLoadStarted = false

  let themeBuffer = null
  let themeLoadStarted = false

  function ensureCtx() {
    if (ctx) return ctx
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    masterGain = ctx.createGain()
    masterGain.gain.value = 1.0
    masterGain.connect(ctx.destination)
    loadTick()
    loadTheme()
    return ctx
  }

  async function loadTick() {
    if (tickLoadStarted || !ctx) return
    tickLoadStarted = true
    try {
      const res = await fetch(toneUrl)
      const arr = await res.arrayBuffer()
      tickBuffer = await ctx.decodeAudioData(arr)
    } catch (e) {
      tickBuffer = null
    }
  }

  async function loadTheme() {
    if (themeLoadStarted || !ctx) return
    themeLoadStarted = true
    try {
      const res = await fetch(themeWavUrl)
      const arr = await res.arrayBuffer()
      themeBuffer = await ctx.decodeAudioData(arr)
    } catch (e) {
      themeBuffer = null
    }
  }

  function resume() {
    const c = ensureCtx()
    if (c && c.state === 'suspended') c.resume()
  }

  function setMuted(v) {
    muted = !!v
    if (masterGain) masterGain.gain.value = muted ? 0 : 1.0
  }

  function tickThink() {
    const c = ensureCtx()
    if (!c || muted) return
    if (tickBuffer) {
      const src = c.createBufferSource()
      src.buffer = tickBuffer
      src.playbackRate.value = 1.0
      src.connect(masterGain)
      src.start()
      return
    }
    const t = c.currentTime
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'square'
    o.frequency.value = 600
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.04, t + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
    o.connect(g).connect(masterGain)
    o.start(t)
    o.stop(t + 0.06)
  }

  function playTheme() {
    const c = ensureCtx()
    if (!c || muted || !themeBuffer) return null
    const src = c.createBufferSource()
    src.buffer = themeBuffer
    const g = c.createGain()
    g.gain.value = 0.9
    src.connect(g).connect(masterGain)
    src.start()
    return src
  }

  return { resume, setMuted, tickThink, playTheme }
})()

export default LoaderAudio
