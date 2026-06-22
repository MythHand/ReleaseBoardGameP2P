import { useRef, useState } from 'react'
import { play, presetNames } from '@/animations'
import { CARDS } from '@/cards'
import Card from '@/primitives/Card'
import styles from './AnimationsStory.module.css'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const TRAVEL = new Set(['playToCenter', 'playToReleaseZone', 'centerToDiscard'])

// Витрина словаря анимаций: каждый пресет вызывается по имени play('name', el).
export default function AnimationsStory() {
  const cardRef = useRef<HTMLDivElement>(null)
  const targetRef = useRef<HTMLDivElement>(null)
  const [faceDown, setFaceDown] = useState(false)
  const [busy, setBusy] = useState(false)
  const card = CARDS[1] // Security Bug

  const run = async (name: string) => {
    if (busy) return
    if (name === 'flipCard') {
      setFaceDown((v) => !v) // Card сам играет flipCard через словарь
      return
    }
    // biome-ignore lint/style/noNonNullAssertion: cardRef is always attached to the rendered card element
    const el = cardRef.current!
    for (const a of el.getAnimations()) a.cancel()

    if (name === 'snap') {
      play('snap', el)
      return
    }

    if (TRAVEL.has(name)) {
      setBusy(true)
      const from = el.getBoundingClientRect()
      // biome-ignore lint/style/noNonNullAssertion: targetRef is always attached to the rendered target element
      const to = targetRef.current!.getBoundingClientRect()
      const anim = play(name, el, { from, to })
      if (anim) await anim.finished
      await wait(500)
      for (const a of el.getAnimations()) a.cancel() // вернуть карту домой
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
          <button
            type="button"
            key={name}
            className={styles.btn}
            onClick={() => run(name)}
            disabled={busy}
          >
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
