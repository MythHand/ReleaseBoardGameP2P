import { makeTable } from '@/mocks/table'
import MoveHistory, {
  MOVE_HISTORY_COPY_EN,
  MOVE_HISTORY_COPY_RU,
} from '@/table/MoveHistory/MoveHistory'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'

// Лента ходов: иконки целей, комбо-связки, откаты и отскоки. Данные — из мока.
const { history } = makeTable(3)

export default function MoveHistoryBlock() {
  const { lang } = useLang()
  const copy = pick(lang, { ru: MOVE_HISTORY_COPY_RU, en: MOVE_HISTORY_COPY_EN })

  return (
    <KitPage title="Move history" tag="блок">
      <KitSection title="Журнал партии — цели, комбо, системные события">
        <div style={{ inlineSize: 360 }}>
          <MoveHistory entries={history} copy={copy} />
        </div>
      </KitSection>
    </KitPage>
  )
}
