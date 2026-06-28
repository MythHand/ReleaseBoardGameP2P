import { type CSSProperties, useState } from 'react'
import Button from '@/primitives/Button'
import EdgeGlow from '@/primitives/EdgeGlow'
import { KitPage, KitSection } from './KitShell'

// EdgeGlow позиционируется абсолютно — нужна relative-сцена. Контрол держим
// внутри секции (как в OverlayKit), чтобы не липнуть к заголовку страницы.
const wrap: CSSProperties = { inlineSize: '100%' }
const controls: CSSProperties = { display: 'flex', gap: 12, marginBlockEnd: 12 }
const stage: CSSProperties = {
  position: 'relative',
  inlineSize: '100%',
  minBlockSize: 300,
  overflow: 'hidden',
  border: '1px solid rgb(255 255 255 / 12%)',
}
const filler: CSSProperties = {
  padding: 20,
  color: 'rgb(255 255 255 / 35%)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
}

function Demo({ intensity }: { intensity: 'strong' | 'weak' }) {
  const [on, setOn] = useState(true)
  return (
    <div style={wrap}>
      <div style={controls}>
        <Button variant="tech" onClick={() => setOn((v) => !v)}>
          {on ? 'скрыть' : 'показать'}
        </Button>
      </div>
      <div style={stage}>
        <div style={filler}>контент под подсветкой</div>
        <EdgeGlow visible={on} intensity={intensity} />
      </div>
    </div>
  )
}

export default function EdgeGlowKit() {
  return (
    <KitPage title="Edge glow">
      <KitSection title="Сильное — стол игрока (плавно от краёв)">
        <Demo intensity="strong" />
      </KitSection>
      <KitSection title="Слабое — место соперника">
        <Demo intensity="weak" />
      </KitSection>
    </KitPage>
  )
}
