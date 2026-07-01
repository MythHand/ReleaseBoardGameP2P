import { CARDS } from '@/cards'
import Pile from '@/primitives/Pile'
import { useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from './KitShell'

// The real Pile primitive: a deck (face down) or a discard (top card face up).
// Shows the pile "depth" + counter + label.
const TOP_CARD = CARDS[0]

const COPY = {
  ru: {
    decks: "Колоды — рубашкой вверх, счётчик в углу (countPos='tl')",
    deck: 'Колода',
    aiDeck: 'ИИ-колода',
    discardSec: "Сброс — верхняя карта лицом, бейдж справа снизу (countPos='br')",
    discard: 'Сброс',
    withCard: 'с картой',
    empty: 'пустой',
  },
  en: {
    decks: "Decks — face down, counter in the corner (countPos='tl')",
    deck: 'Deck',
    aiDeck: 'AI deck',
    discardSec: "Discard — top card face up, badge bottom-right (countPos='br')",
    discard: 'Discard',
    withCard: 'with a card',
    empty: 'empty',
  },
}

export default function PilesKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  return (
    <KitPage title="Piles">
      <KitSection title={t.decks}>
        <KitCell caption="base">
          <Pile label={t.deck} deck="base" count={24} countPos="tl" />
        </KitCell>
        <KitCell caption="ai">
          <Pile label={t.aiDeck} deck="ai" count={8} countPos="tl" />
        </KitCell>
      </KitSection>

      <KitSection title={t.discardSec}>
        <KitCell caption={t.withCard}>
          <Pile label={t.discard} topCard={TOP_CARD} count={3} countPos="br" />
        </KitCell>
        <KitCell caption={t.empty}>
          <Pile label={t.discard} count={0} logoVariant={lang} />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
