import { CARD_CONTENT } from '@/cards'
import { PARALLAX_CARDS } from '@/cards/CardParallax'
import ComposedFace from '@/cards/CardParallax/ComposedFace'
import { useCardLang } from '@/cards/cardLang'
import type { Card } from '@/cards/types'
import styles from './Card.module.css'

interface CardFaceProps {
  card: Card | null | undefined
  // pointer deflection from the owner (Card) — drives the composed face's parallax
  p?: { x: number; y: number }
  // force the flat PNG face (the "OG Card" showcase, or where composed isn't wanted)
  png?: boolean
}

// ТОЧКА ПОДМЕНЫ рендера лица карты.
// По умолчанию — собранное из кода composed-лицо (по card.id + язык). Плоский PNG
// остаётся как fallback (нет config/content) или по явному запросу (png) — так PNG
// живёт только там, где нужен (напр. страница-витрина «OG Card»).
// card.art — уже разрешённый URL (assetUrl вызван в каталоге), берём напрямую.
export default function CardFace({ card, p, png }: CardFaceProps) {
  const lang = useCardLang()
  if (!card) return null
  const config = png ? undefined : PARALLAX_CARDS[card.id]
  const content = config ? CARD_CONTENT[card.id]?.[lang] : undefined
  if (config && content) {
    return (
      <ComposedFace
        config={config}
        content={{ title: content.title, description: content.paragraphs }}
        p={p}
      />
    )
  }
  return <img className={styles.img} src={card.art} alt={card.name} draggable={false} />
}
