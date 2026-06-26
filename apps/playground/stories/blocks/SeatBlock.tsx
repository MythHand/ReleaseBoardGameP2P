import { makeTable } from '@/mocks/table'
import Seat, { SEAT_COPY_EN, SEAT_COPY_RU } from '@/table/Seat/Seat'
import { pick, useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from '../kit/KitShell'

// Место оппонента в разных состояниях. Данные игрока — из мок-снимка стола.
const player = makeTable(3).opponents[0]

export default function SeatBlock() {
  const { lang } = useLang()
  const copy = pick(lang, { ru: SEAT_COPY_RU, en: SEAT_COPY_EN })

  return (
    <KitPage title="Seat" tag="блок">
      <KitSection title="Состояния места">
        <KitCell caption="обычное">
          <Seat player={player} copy={copy} />
        </KitCell>
        <KitCell caption="ход (active)">
          <Seat player={player} active copy={copy} />
        </KitCell>
        <KitCell caption="выбыл">
          <Seat player={player} eliminated copy={copy} />
        </KitCell>
        <KitCell caption="нет связи">
          <Seat player={player} disconnected copy={copy} />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
