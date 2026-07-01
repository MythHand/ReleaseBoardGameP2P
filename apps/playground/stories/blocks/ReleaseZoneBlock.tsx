import { cardById } from '@/cards'
import ReleaseZone, { type ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import { pick, useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from '../kit/KitShell'

// Release zone: one slot per type (Frontend / Backend / Database).
const FULL: ReleaseSlots = {
  frontend: cardById('release-frontend'),
  backend: cardById('release-backend'),
  database: cardById('release-database'),
}
const PARTIAL: ReleaseSlots = { backend: cardById('release-backend') }

export default function ReleaseZoneBlock() {
  const { lang } = useLang()
  const w = pick(lang, {
    ru: {
      fill: 'Заполненность слотов',
      empty: 'пустая',
      partial: 'частично (1 из 3)',
      full: 'собран релиз (3 из 3)',
    },
    en: {
      fill: 'Slot fill',
      empty: 'empty',
      partial: 'partial (1 of 3)',
      full: 'full release (3 of 3)',
    },
  })

  return (
    <KitPage title="Release zone" tag="block">
      <KitSection title={w.fill}>
        <KitCell caption={w.empty}>
          <ReleaseZone />
        </KitCell>
        <KitCell caption={w.partial}>
          <ReleaseZone release={PARTIAL} />
        </KitCell>
        <KitCell caption={w.full}>
          <ReleaseZone release={FULL} />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
