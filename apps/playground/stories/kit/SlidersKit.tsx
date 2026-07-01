import { useState } from 'react'
import Slider from '@/primitives/Slider'
import { useLang } from '../../Playground/lang'
import { KitPage, KitSection } from './KitShell'

const SPEC_MAX = 28
// traffic light: 0–8 green, 9–18 yellow, 19–28 red
function specColorFor(n: number) {
  if (n <= 8) return '#8fd9b0'
  if (n <= 18) return '#e3b341'
  return '#ff6b81'
}

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
            max={SPEC_MAX}
            onChange={setSpec}
            color={specColorFor(spec)}
            fill
          />
        </div>
      </KitSection>
    </KitPage>
  )
}
