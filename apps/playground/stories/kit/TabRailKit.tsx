import { type CSSProperties, useState } from 'react'
import Drawer from '@/primitives/Drawer'
import TabRail, { type TabRailItem } from '@/primitives/TabRail'
import { useLang } from '../../Playground/lang'
import { KitPage, KitSection } from './KitShell'

// The rail sits at the right edge; for the demo — paired with a Drawer (as on the table).
// `--drawer-offset` = rail width: the drawer slides out to the LEFT of it.
// The custom property is inherited from the stage down to the nested Drawer.
// `--drawer-offset` is added via an assertion — custom props aren't in CSSProperties.
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

const COPY = {
  ru: {
    section: 'Рейл у края — переключает панели (клик по активной закрывает)',
    note: 'Рейл всегда виден в своей полосе у края — он не выезжает. Для примера в паре с Drawer: клик по вкладке выдвигает панель слева от рейла (как на столе), клик по активной — задвигает.',
  },
  en: {
    section: 'Rail at the edge — switches panels (click the active one to close)',
    note: "The rail is always visible in its edge strip — it doesn't slide out. Paired with a Drawer for the demo: clicking a tab slides a panel out to the left of the rail (as on the table), clicking the active one slides it back.",
  },
}

export default function TabRailKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  // closed by default — on start only the rail strip at the edge is visible
  const [active, setActive] = useState<string | null>(null)

  return (
    <KitPage title="Tab rail">
      <KitSection title={t.section}>
        <div style={stage}>
          <p style={note}>{t.note}</p>

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
