import Dropdown from '@/primitives/Dropdown'
import { useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from './KitShell'

// The real Dropdown primitive — an actions menu opened by the "⋯" button.
const COPY = {
  ru: {
    menu: 'Меню действий по «⋯»',
    normalCap: 'обычный + danger',
    makeSpectator: 'Сделать зрителем',
    remove: 'Исключить',
    disabledCap: 'недоступный пункт → подсказка по клику',
    makePlayer: 'Сделать игроком',
    noSlot: 'Нет доступного слота',
  },
  en: {
    menu: 'Actions menu on "⋯"',
    normalCap: 'normal + danger',
    makeSpectator: 'Make spectator',
    remove: 'Remove',
    disabledCap: 'disabled item → hint on click',
    makePlayer: 'Make player',
    noSlot: 'No available slot',
  },
}

export default function DropdownKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  return (
    <KitPage title="Dropdown">
      <KitSection title={t.menu}>
        <KitCell caption={t.normalCap}>
          <Dropdown
            items={[
              { label: t.makeSpectator, onClick: () => {} },
              { label: t.remove, danger: true, onClick: () => {} },
            ]}
          />
        </KitCell>
        <KitCell caption={t.disabledCap}>
          <Dropdown
            items={[
              {
                label: t.makePlayer,
                disabled: true,
                hint: t.noSlot,
                onClick: () => {},
              },
              { label: t.remove, danger: true, onClick: () => {} },
            ]}
          />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
