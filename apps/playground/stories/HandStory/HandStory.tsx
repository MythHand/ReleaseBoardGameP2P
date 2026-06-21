import { CARDS } from '@/cards'
import { makeHand } from '@/mocks/hand'
import Hand from '@/table/Hand'
import { useState } from 'react'
import styles from './HandStory.module.css'

let _u = 0
const uid = () => `s${++_u}`

export default function HandStory() {
  const [items, setItems] = useState(() => makeHand(6))
  const [faceDown, setFaceDown] = useState(false)

  const add = () => setItems((p) => [...p, { uid: uid(), card: CARDS[p.length % CARDS.length] }])
  const remove = () => setItems((p) => p.slice(0, -1))
  const reset = () => setItems(makeHand(6))

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <button type="button" className={styles.btn} onClick={remove} disabled={items.length <= 1}>
          − карта
        </button>
        <span className={styles.count}>{items.length}</span>
        <button type="button" className={styles.btn} onClick={add} disabled={items.length >= 10}>
          + карта
        </button>
        <button type="button" className={styles.btn} onClick={reset}>
          сброс
        </button>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={faceDown}
            onChange={(e) => setFaceDown(e.target.checked)}
          />
          рубашкой вверх
        </label>
      </div>

      <p className={styles.hint}>
        Наведи на карту — поднимается и читается, соседи расступаются. Добавляй/убирай — веер плавно
        переукладывается.
      </p>

      <div className={styles.stage}>
        <Hand items={items} faceDown={faceDown} />
      </div>
    </div>
  )
}
