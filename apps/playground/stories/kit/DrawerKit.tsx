import { type CSSProperties, useState } from 'react'
import Button from '@/primitives/Button'
import Drawer from '@/primitives/Drawer'
import { KitPage, KitSection } from './KitShell'

// Drawer позиционируется абсолютно — нужна relative-сцена, которая его обрезает.
// Кнопки держим НАД сценой, чтобы открытая шторка их не перекрывала.
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

export default function DrawerKit() {
  const [left, setLeft] = useState(false)
  const [right, setRight] = useState(false)

  return (
    <KitPage title="Drawer">
      <KitSection title="Выезжает по кнопке от края — side / width задаются пропами">
        <div style={wrap}>
          <div style={controls}>
            <Button variant="tech" onClick={() => setLeft((v) => !v)}>
              {left ? 'задвинуть left' : 'выдвинуть left'}
            </Button>
            <Button variant="tech" onClick={() => setRight((v) => !v)}>
              {right ? 'задвинуть right' : 'выдвинуть right'}
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
