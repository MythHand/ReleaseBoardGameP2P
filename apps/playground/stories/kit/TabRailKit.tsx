import { type CSSProperties, useState } from 'react'
import Drawer from '@/primitives/Drawer'
import TabRail, { type TabRailItem } from '@/primitives/TabRail'
import { KitPage, KitSection } from './KitShell'

// Рейл стоит у правого края; для примера — в паре с Drawer (как на столе).
// `--drawer-offset` = ширина рейла: шторка выезжает СЛЕВА от него.
// Кастом-проперти наследуется от сцены к вложенному Drawer.
// `--drawer-offset` добавляем ассерцией — кастом-проперти нет в типе CSSProperties.
const stage = {
  position: 'relative',
  inlineSize: '100%',
  minBlockSize: 420,
  boxSizing: 'border-box',
  overflow: 'hidden',
  border: '1px solid rgb(255 255 255 / 12%)',
  '--drawer-offset': '56px',
} as CSSProperties
const note: CSSProperties = {
  position: 'absolute',
  insetBlock: '16px auto',
  insetInline: '16px auto',
  margin: 0,
  maxInlineSize: 280,
  color: 'rgb(255 255 255 / 40%)',
  fontSize: 12,
  lineHeight: 1.6,
}
const readout: CSSProperties = {
  margin: 0,
  color: 'rgb(255 255 255 / 70%)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
}

const ITEMS: TabRailItem[] = [
  { id: 'a', label: 'tab a' },
  { id: 'b', label: 'tab b' },
  { id: 'c', label: 'tab c' },
]

export default function TabRailKit() {
  // по умолчанию закрыто — на старте видна только полоса рейла у края
  const [active, setActive] = useState<string | null>(null)

  return (
    <KitPage title="Tab rail">
      <KitSection title="Рейл у края — переключает панели (клик по активной закрывает)">
        <div style={stage}>
          <p style={note}>
            Рейл всегда виден в своей полосе у края — он не выезжает. Для примера в паре с Drawer:
            клик по вкладке выдвигает панель слева от рейла (как на столе), клик по активной —
            задвигает.
          </p>

          <Drawer open={active !== null} side="right" width={280}>
            <pre style={readout}>{`active: ${active}`}</pre>
          </Drawer>

          <TabRail
            items={ITEMS}
            active={active}
            onSelect={(id) => setActive((cur) => (cur === id ? null : id))}
            side="right"
          />
        </div>
      </KitSection>
    </KitPage>
  )
}
