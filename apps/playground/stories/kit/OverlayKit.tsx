import { type CSSProperties, useState } from 'react'
import Button from '@/primitives/Button'
import Overlay from '@/primitives/Overlay'
import { useLang } from '../../Playground/lang'
import { KitPage, KitSection } from './KitShell'

// Overlay is absolutely positioned — it needs a relative stage. The button stays
// above the stage so the scrim doesn't cover it.
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

const COPY = {
  ru: {
    hide: 'скрыть',
    show: 'показать',
    filler: 'контент под оверлеем',
    section: 'Scrim + блюр + центрирование + плавное появление',
  },
  en: {
    hide: 'hide',
    show: 'show',
    filler: 'content under the overlay',
    section: 'Scrim + blur + centering + smooth appearance',
  },
}

export default function OverlayKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  const [open, setOpen] = useState(false)

  return (
    <KitPage title="Overlay">
      <KitSection title={t.section}>
        <div style={wrap}>
          <div style={controls}>
            <Button variant="tech" onClick={() => setOpen((v) => !v)}>
              {open ? t.hide : t.show}
            </Button>
          </div>
          <div style={stage}>
            <div style={filler}>{t.filler}</div>
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
