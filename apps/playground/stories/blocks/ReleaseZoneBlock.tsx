import { cardById } from '@/cards'
import ReleaseZone, { type ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import { pick, useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from '../kit/KitShell'

// Release zone: one slot per Release type (Frontend / Backend / Database) plus a
// Monitoring slot (defensive card in the zone, not a Release).
const FULL: ReleaseSlots = {
  frontend: cardById('release-frontend'),
  backend: cardById('release-backend'),
  database: cardById('release-database'),
}
const PARTIAL: ReleaseSlots = { backend: cardById('release-backend') }
const WITH_MONITORING: ReleaseSlots = {
  ...FULL,
  monitoring: cardById('protection-monitoring'),
}

export default function ReleaseZoneBlock() {
  const { lang } = useLang()
  const w = pick(lang, {
    ru: {
      fill: 'Заполненность слотов',
      empty: 'пустая',
      partial: 'частично (1 из 3)',
      full: 'собран релиз (3 из 3)',
      withMon: 'релиз + Monitoring',
      compactT: 'Compact — карты в 1.4× меньше, подпись вертикально',
      compEmpty: 'пустая',
      compFull: 'релиз + Monitoring',
    },
    en: {
      fill: 'Slot fill',
      empty: 'empty',
      partial: 'partial (1 of 3)',
      full: 'full release (3 of 3)',
      withMon: 'release + Monitoring',
      compactT: 'Compact — cards 1.4× smaller, label vertical',
      compEmpty: 'empty',
      compFull: 'release + Monitoring',
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
        <KitCell caption={w.withMon}>
          <ReleaseZone release={WITH_MONITORING} />
        </KitCell>
      </KitSection>

      <KitSection title={w.compactT}>
        <KitCell caption={w.compEmpty}>
          <ReleaseZone variant="compact" />
        </KitCell>
        <KitCell caption={w.compFull}>
          <ReleaseZone variant="compact" release={WITH_MONITORING} />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
