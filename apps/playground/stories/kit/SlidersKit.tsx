import { useState } from 'react'
import Slider from '@/primitives/Slider'
import { KitPage, KitSection } from './KitShell'

const SPEC_MAX = 28
// светофор: 0–8 зелёный, 9–18 жёлтый, 19–28 красный
function specColorFor(n: number) {
  if (n <= 8) return '#8fd9b0'
  if (n <= 18) return '#e3b341'
  return '#ff6b81'
}

// Реальный примитив Slider: обычный и светофорный (цвет + заливка от значения).
export default function SlidersKit() {
  const [capacity, setCapacity] = useState(5)
  const [spec, setSpec] = useState(8)

  return (
    <KitPage title="Sliders">
      <KitSection title="Обычный — вместимость">
        <div style={{ inlineSize: 340 }}>
          <Slider label="Вместимость" value={capacity} min={2} max={6} onChange={setCapacity} />
        </div>
      </KitSection>

      <KitSection title="Светофорный — лимит зрителей (цвет и заливка зависят от значения)">
        <div style={{ inlineSize: 340 }}>
          <Slider
            label="Лимит"
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
