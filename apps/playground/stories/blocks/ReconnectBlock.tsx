import type { CSSProperties } from 'react'
import Reconnect, { RECONNECT_COPY_EN, RECONNECT_COPY_RU } from '@/table/Reconnect'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'

// Окно переподключения поверх стола (Overlay + Spinner). Текст — по языку.
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
  color: 'rgb(255 255 255 / 30%)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
}

export default function ReconnectBlock() {
  const { lang } = useLang()
  const copy = pick(lang, { ru: RECONNECT_COPY_RU, en: RECONNECT_COPY_EN })

  return (
    <KitPage title="Reconnect" tag="блок">
      <KitSection title="Окно переподключения поверх стола">
        <div style={stage}>
          <div style={filler}>стол под окном</div>
          <Reconnect copy={copy} />
        </div>
      </KitSection>
    </KitPage>
  )
}
