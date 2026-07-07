import { makeTable } from '@/mocks/table'
import MoveHistory from '@/table/MoveHistory/MoveHistory'
import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'

// Move feed: target icons, combo links, rollbacks and bounces. Data from the mock.
const { history } = makeTable(3)

export default function MoveHistoryBlock() {
  const { lang } = useLang()
  const copy = pick(lang, { ru: ruCommon.moveHistory, en: enCommon.moveHistory })

  return (
    <KitPage title="Move history" tag="block">
      <KitSection
        title={pick(lang, {
          ru: 'Журнал партии — цели, комбо, системные события',
          en: 'Match log — targets, combos, system events',
        })}
      >
        <div style={{ inlineSize: 360 }}>
          <MoveHistory entries={history} copy={copy} />
        </div>
      </KitSection>
    </KitPage>
  )
}
