import { cardById } from '@/cards'
import ReleaseZone, { type ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import { KitCell, KitPage, KitSection } from '../kit/KitShell'

// Зона релиза: по слоту на тип (Frontend / Backend / Database).
const FULL: ReleaseSlots = {
  frontend: cardById('release-frontend'),
  backend: cardById('release-backend'),
  database: cardById('release-database'),
}
const PARTIAL: ReleaseSlots = { backend: cardById('release-backend') }

export default function ReleaseZoneBlock() {
  return (
    <KitPage title="Release zone" tag="блок">
      <KitSection title="Заполненность слотов">
        <KitCell caption="пустая">
          <ReleaseZone />
        </KitCell>
        <KitCell caption="частично (1 из 3)">
          <ReleaseZone release={PARTIAL} />
        </KitCell>
        <KitCell caption="собран релиз (3 из 3)">
          <ReleaseZone release={FULL} />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
