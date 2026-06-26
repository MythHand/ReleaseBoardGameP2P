import { useState } from 'react'
import { CARDS } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import Slider from '@/primitives/Slider'
import Hand from '@/table/Hand'
import { handStep } from '@/table/Hand/Hand'
import styles from './HandStory.module.css'

let _u = 0
const uid = () => `s${++_u}`

interface Item {
  uid: string
  card: CardType
}

// меняем длину, сохраняя существующие uid — веер плавно переукладывается
function resize(n: number, prev: Item[] = []): Item[] {
  const next = prev.slice(0, n)
  while (next.length < n) next.push({ uid: uid(), card: CARDS[next.length % CARDS.length] })
  return next
}

export default function HandStory() {
  const [items, setItems] = useState<Item[]>(() => resize(6))
  const [faceDown, setFaceDown] = useState(false)

  const setCount = (n: number) => setItems((prev) => resize(n, prev))
  const step = items.length >= 2 ? Math.round(handStep(items.length)) : 0
  const span = items.length >= 2 ? Math.round((items.length - 1) * handStep(items.length)) : 0

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <div className={styles.sliderWrap}>
          <Slider label="карт в руке" value={items.length} min={0} max={20} onChange={setCount} />
        </div>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={faceDown}
            onChange={(e) => setFaceDown(e.target.checked)}
          />
          рубашкой вверх
        </label>
      </div>

      <p className={styles.readout}>
        шаг между картами: <b>{step}px</b> · ширина веера: <b>{span}px</b>
      </p>

      <div className={styles.stage}>
        <Hand items={items} faceDown={faceDown} />
      </div>
    </div>
  )
}
