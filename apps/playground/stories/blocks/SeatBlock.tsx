import { makeTable } from '@/mocks/table'
import Seat, { SEAT_COPY_EN, SEAT_COPY_RU } from '@/table/Seat/Seat'
import { pick, useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from '../kit/KitShell'

// The opponent seat in various states. Player data from a mock table snapshot.
const player = makeTable(3).opponents[0]

export default function SeatBlock() {
  const { lang } = useLang()
  const copy = pick(lang, { ru: SEAT_COPY_RU, en: SEAT_COPY_EN })
  const w = pick(lang, {
    ru: {
      states: 'Состояния места',
      normal: 'обычное',
      turn: 'ход (active)',
      out: 'выбыл',
      noConn: 'нет связи',
    },
    en: {
      states: 'Seat states',
      normal: 'default',
      turn: 'turn (active)',
      out: 'eliminated',
      noConn: 'no connection',
    },
  })

  return (
    <KitPage title="Seat" tag="block">
      <KitSection title={w.states}>
        <KitCell caption={w.normal}>
          <Seat player={player} copy={copy} />
        </KitCell>
        <KitCell caption={w.turn}>
          <Seat player={player} active copy={copy} />
        </KitCell>
        <KitCell caption={w.out}>
          <Seat player={player} eliminated copy={copy} />
        </KitCell>
        <KitCell caption={w.noConn}>
          <Seat player={player} disconnected copy={copy} />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
