import { CARDS } from '@/cards'
import Pile from '@/primitives/Pile'
import { useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from './KitShell'

// Реальный примитив Pile: колода (рубашкой вверх) или сброс (верхняя карта
// лицом). Показывает «глубину» стопки + счётчик + подпись.
const TOP_CARD = CARDS[0]

export default function PilesKit() {
  const { lang } = useLang()
  return (
    <KitPage title="Piles">
      <KitSection title="Колоды — рубашкой вверх, счётчик в углу (countPos='tl')">
        <KitCell caption="base">
          <Pile label="Колода" deck="base" count={24} countPos="tl" />
        </KitCell>
        <KitCell caption="ai">
          <Pile label="ИИ-колода" deck="ai" count={8} countPos="tl" />
        </KitCell>
      </KitSection>

      <KitSection title="Сброс — верхняя карта лицом, бейдж справа снизу (countPos='br')">
        <KitCell caption="с картой">
          <Pile label="Сброс" topCard={TOP_CARD} count={3} countPos="br" />
        </KitCell>
        <KitCell caption="пустой">
          <Pile label="Сброс" count={0} logoVariant={lang} />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
