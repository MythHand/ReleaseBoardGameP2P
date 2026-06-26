import { useState } from 'react'
import ModeSelect, { type ModeOption } from '@/primitives/ModeSelect'
import { KitPage, KitSection } from './KitShell'

// Реальный примитив ModeSelect: заголовок + варианты в строчку + «ползунок»,
// который едет к активному. Текст — через пропсы (i18n-agnostic).
const OPTIONS: ModeOption[] = [
  { value: 'base', label: 'База', desc: 'обычная колода' },
  { value: 'ai', label: 'AI', desc: 'с ИИ-картами' },
  { value: 'chaos', label: 'Хаос', desc: 'всё и сразу' },
]

export default function ModeSelectKit() {
  const [value, setValue] = useState('base')

  return (
    <KitPage title="Mode select">
      <KitSection title="Интерактивный — ползунок едет к активному варианту">
        <div style={{ inlineSize: 380 }}>
          <ModeSelect title="Колода" options={OPTIONS} value={value} onChange={setValue} />
        </div>
      </KitSection>

      <KitSection title="readOnly — настраивает host (гость видит, но не меняет)">
        <div style={{ inlineSize: 380 }}>
          <ModeSelect title="Колода" options={OPTIONS} value="ai" readOnly />
        </div>
      </KitSection>

      <KitSection title="disabled — недоступно">
        <div style={{ inlineSize: 380 }}>
          <ModeSelect title="Колода" options={OPTIONS} value="base" disabled />
        </div>
      </KitSection>
    </KitPage>
  )
}
