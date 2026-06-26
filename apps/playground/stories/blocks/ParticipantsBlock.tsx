import { makeTable } from '@/mocks/table'
import Participants, {
  PARTICIPANTS_COPY_EN,
  PARTICIPANTS_COPY_RU,
} from '@/table/Participants/Participants'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'

// Полный состав стола: игроки (в игре / выбыл / нет связи) и зрители.
const { participants, spectators } = makeTable(4)

export default function ParticipantsBlock() {
  const { lang } = useLang()
  const copy = pick(lang, { ru: PARTICIPANTS_COPY_RU, en: PARTICIPANTS_COPY_EN })

  return (
    <KitPage title="Participants" tag="блок">
      <KitSection title="Игроки и зрители">
        <div style={{ inlineSize: 320 }}>
          <Participants players={participants} spectators={spectators} copy={copy} />
        </div>
      </KitSection>
    </KitPage>
  )
}
