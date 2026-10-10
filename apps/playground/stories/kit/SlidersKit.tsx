import { MAX_SPECTATORS, spectatorLimitColor } from '@release/ui'
import { useState } from 'react'
import Slider from '@/primitives/Slider'
import { useLang } from '../../Playground/lang'
import { KitPage, KitSection } from './KitShell'

const COPY = {
  ru: {
    plain: 'Обычный — вместимость',
    capacity: 'Вместимость',
    traffic: 'Светофорный — лимит зрителей (цвет и заливка зависят от значения)',
    limit: 'Лимит',
  },
  en: {
    plain: 'Plain — capacity',
    capacity: 'Capacity',
    traffic: 'Traffic-light — spectator limit (color and fill depend on the value)',
    limit: 'Limit',
  },
}

// The real Slider primitive: plain and traffic-light (color + fill from the value).
export default function SlidersKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  const [capacity, setCapacity] = useState(5)
  const [spec, setSpec] = useState(8)

  return (
    <KitPage title="Sliders">
      <KitSection title={t.plain}>
        <div style={{ inlineSize: 340 }}>
          <Slider label={t.capacity} value={capacity} min={2} max={6} onChange={setCapacity} />
        </div>
      </KitSection>

      <KitSection title={t.traffic}>
        <div style={{ inlineSize: 340 }}>
          <Slider
            label={t.limit}
            value={spec}
            min={0}
            max={MAX_SPECTATORS}
            onChange={setSpec}
            color={spectatorLimitColor(spec)}
            fill
          />
        </div>
      </KitSection>
    </KitPage>
  )
}
