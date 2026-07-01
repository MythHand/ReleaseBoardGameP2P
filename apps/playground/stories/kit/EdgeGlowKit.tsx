import { type CSSProperties, useState } from 'react'
import Button from '@/primitives/Button'
import EdgeGlow from '@/primitives/EdgeGlow'
import { useLang } from '../../Playground/lang'
import { KitPage, KitSection } from './KitShell'

// EdgeGlow is absolutely positioned — it needs a relative stage. The control
// stays inside the section (as in OverlayKit) so it doesn't stick to the page title.
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

const COPY = {
  ru: {
    hide: 'скрыть',
    show: 'показать',
    filler: 'контент под подсветкой',
    strong: 'Сильное — стол игрока (плавно от краёв)',
    weak: 'Слабое — место соперника',
  },
  en: {
    hide: 'hide',
    show: 'show',
    filler: 'content under the glow',
    strong: "Strong — player's table (smooth from the edges)",
    weak: "Weak — opponent's seat",
  },
}

function Demo({ intensity, t }: { intensity: 'strong' | 'weak'; t: (typeof COPY)['ru'] }) {
  const [on, setOn] = useState(true)
  return (
    <div style={wrap}>
      <div style={controls}>
        <Button variant="tech" onClick={() => setOn((v) => !v)}>
          {on ? t.hide : t.show}
        </Button>
      </div>
      <div style={stage}>
        <div style={filler}>{t.filler}</div>
        <EdgeGlow visible={on} intensity={intensity} />
      </div>
    </div>
  )
}

export default function EdgeGlowKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  return (
    <KitPage title="Edge glow">
      <KitSection title={t.strong}>
        <Demo intensity="strong" t={t} />
      </KitSection>
      <KitSection title={t.weak}>
        <Demo intensity="weak" t={t} />
      </KitSection>
    </KitPage>
  )
}
