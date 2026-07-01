import { useState } from 'react'
import ModeSelect, { type ModeOption } from '@/primitives/ModeSelect'
import { type Lang, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from './KitShell'

// The real ModeSelect primitive: heading + inline options + a "thumb" that
// slides to the active one. Copy comes via props (i18n-agnostic).
const OPTIONS: Record<Lang, ModeOption[]> = {
  ru: [
    { value: 'base', label: 'База', desc: 'обычная колода' },
    { value: 'ai', label: 'AI', desc: 'с ИИ-картами' },
    { value: 'chaos', label: 'Хаос', desc: 'всё и сразу' },
  ],
  en: [
    { value: 'base', label: 'Base', desc: 'standard deck' },
    { value: 'ai', label: 'AI', desc: 'with AI cards' },
    { value: 'chaos', label: 'Chaos', desc: 'everything at once' },
  ],
}

const COPY = {
  ru: {
    deck: 'Колода',
    interactive: 'Интерактивный — ползунок едет к активному варианту',
    readOnly: 'readOnly — настраивает host (гость видит, но не меняет)',
    disabled: 'disabled — недоступно',
  },
  en: {
    deck: 'Deck',
    interactive: 'Interactive — the thumb slides to the active option',
    readOnly: "readOnly — host configures (guest sees, can't change)",
    disabled: 'disabled — unavailable',
  },
}

export default function ModeSelectKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  const options = OPTIONS[lang]
  const [value, setValue] = useState('base')

  return (
    <KitPage title="Mode select">
      <KitSection title={t.interactive}>
        <div style={{ inlineSize: 380 }}>
          <ModeSelect title={t.deck} options={options} value={value} onChange={setValue} />
        </div>
      </KitSection>

      <KitSection title={t.readOnly}>
        <div style={{ inlineSize: 380 }}>
          <ModeSelect title={t.deck} options={options} value="ai" readOnly />
        </div>
      </KitSection>

      <KitSection title={t.disabled}>
        <div style={{ inlineSize: 380 }}>
          <ModeSelect title={t.deck} options={options} value="base" disabled />
        </div>
      </KitSection>
    </KitPage>
  )
}
