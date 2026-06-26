import { type CSSProperties, useState } from 'react'
import Button from '@/primitives/Button'
import Overlay from '@/primitives/Overlay'
import { KitPage, KitSection } from './KitShell'

// Overlay позиционируется абсолютно — нужна relative-сцена. Кнопку держим над
// сценой, чтобы scrim её не перекрывал.
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
const filler: CSSProperties = {
  padding: 20,
  color: 'rgb(255 255 255 / 35%)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
}
const box: CSSProperties = {
  padding: '20px 28px',
  color: '#fff',
  fontFamily: 'var(--font-mono)',
  fontSize: 14,
  background: 'color-mix(in srgb, var(--surface-1) 94%, #000)',
  border: '1px solid rgb(255 255 255 / 14%)',
}

export default function OverlayKit() {
  const [open, setOpen] = useState(false)

  return (
    <KitPage title="Overlay">
      <KitSection title="Scrim + блюр + центрирование + плавное появление">
        <div style={wrap}>
          <div style={controls}>
            <Button variant="tech" onClick={() => setOpen((v) => !v)}>
              {open ? 'скрыть' : 'показать'}
            </Button>
          </div>
          <div style={stage}>
            <div style={filler}>контент под оверлеем</div>
            {open && (
              <Overlay>
                <div style={box}>overlay content</div>
              </Overlay>
            )}
          </div>
        </div>
      </KitSection>
    </KitPage>
  )
}
