import { type CSSProperties, useState } from 'react'
import Button from '@/primitives/Button'
import Drawer from '@/primitives/Drawer'
import { useLang } from '../../Playground/lang'
import { KitPage, KitSection } from './KitShell'

// Drawer is absolutely positioned — it needs a relative stage that clips it.
// The buttons stay ABOVE the stage so an open drawer doesn't cover them.
const wrap: CSSProperties = { inlineSize: '100%' }
const controls: CSSProperties = { display: 'flex', gap: 12, marginBlockEnd: 12 }
const stage: CSSProperties = {
  position: 'relative',
  inlineSize: '100%',
  minBlockSize: 360,
  boxSizing: 'border-box',
  overflow: 'hidden',
  border: '1px solid rgb(255 255 255 / 12%)',
}
const readout: CSSProperties = {
  margin: 0,
  color: 'rgb(255 255 255 / 70%)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  lineHeight: 1.7,
}

const COPY = {
  ru: {
    section: 'Выезжает по кнопке от края — side / width задаются пропами',
    collapseLeft: 'задвинуть left',
    expandLeft: 'выдвинуть left',
    collapseRight: 'задвинуть right',
    expandRight: 'выдвинуть right',
  },
  en: {
    section: 'Slides in from the edge on a button — side / width set via props',
    collapseLeft: 'collapse left',
    expandLeft: 'expand left',
    collapseRight: 'collapse right',
    expandRight: 'expand right',
  },
}

export default function DrawerKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  const [left, setLeft] = useState(false)
  const [right, setRight] = useState(false)

  return (
    <KitPage title="Drawer">
      <KitSection title={t.section}>
        <div style={wrap}>
          <div style={controls}>
            <Button variant="tech" onClick={() => setLeft((v) => !v)}>
              {left ? t.collapseLeft : t.expandLeft}
            </Button>
            <Button variant="tech" onClick={() => setRight((v) => !v)}>
              {right ? t.collapseRight : t.expandRight}
            </Button>
          </div>

          <div style={stage}>
            <Drawer open={left} side="left" width={240}>
              <pre style={readout}>{`side: left\nwidth: 240\nopen: ${left}`}</pre>
            </Drawer>
            <Drawer open={right} side="right" width={300}>
              <pre style={readout}>{`side: right\nwidth: 300\nopen: ${right}`}</pre>
            </Drawer>
          </div>
        </div>
      </KitSection>
    </KitPage>
  )
}
