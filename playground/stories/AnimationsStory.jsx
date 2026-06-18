import { useRef, useState } from 'react'
import Card from '@/primitives/Card'
import { CARDS } from '@/cards'
import { play, presetNames } from '@/animations'
import styles from './AnimationsStory.module.css'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const TRAVEL = new Set(['playToCenter', 'playToReleaseZone', 'centerToDiscard'])

// Витрина словаря анимаций: каждый пресет вызывается по имени play('name', el).
export default function AnimationsStory() {
  const cardRef = useRef(null)
  const targetRef = useRef(null)
  const [faceDown, setFaceDown] = useState(false)
  const [busy, setBusy] = useState(false)
  const card = CARDS[1] // Security Bug

  const run = async (name) => {
    if (busy) return
    if (name === 'flipCard') {
      setFaceDown((v) => !v) // Card сам играет flipCard через словарь
      return
    }
    const el = cardRef.current
    el.getAnimations().forEach((a) => a.cancel())

    if (name === 'snap') {
      play('snap', el)
      return
    }

    if (TRAVEL.has(name)) {
      setBusy(true)
      const from = el.getBoundingClientRect()
      const to = targetRef.current.getBoundingClientRect()
      const anim = play(name, el, { from, to })
      if (anim) await anim.finished
      await wait(500)
      el.getAnimations().forEach((a) => a.cancel()) // вернуть карту домой
      setBusy(false)
    }
  }

  return (
    <div className={styles.root}>
      <p className={styles.hint}>
        Словарь анимаций — каждый пресет вызывается по имени: <code>play('name', el)</code>.
        Travel-пресеты летят к «цели» и возвращаются.
      </p>

      <div className={styles.buttons}>
        {presetNames().map((name) => (
          <button key={name} className={styles.btn} onClick={() => run(name)} disabled={busy}>
            {name}
          </button>
        ))}
      </div>

      <div className={styles.stage}>
        <div ref={cardRef} className={styles.card}>
          <Card card={card} faceDown={faceDown} interactive={false} width="150px" />
        </div>
        <div ref={targetRef} className={styles.target}>
          цель полёта
        </div>
      </div>
    </div>
  )
}
