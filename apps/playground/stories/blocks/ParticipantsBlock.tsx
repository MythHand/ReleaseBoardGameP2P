import { makeTable } from '@/mocks/table'
import Participants from '@/table/Participants/Participants'
import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'

// Full table roster: players (in game / eliminated / no connection) and spectators.
const { participants, spectators } = makeTable(4)

export default function ParticipantsBlock() {
  const { lang } = useLang()
  const copy = pick(lang, { ru: ruCommon.participants, en: enCommon.participants })

  return (
    <KitPage title="Participants" tag="block">
      <KitSection title={pick(lang, { ru: 'Игроки и зрители', en: 'Players and spectators' })}>
        <div style={{ inlineSize: 320 }}>
          <Participants players={participants} spectators={spectators} copy={copy} />
        </div>
      </KitSection>
    </KitPage>
  )
}
