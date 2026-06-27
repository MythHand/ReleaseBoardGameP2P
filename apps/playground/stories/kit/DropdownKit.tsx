import Dropdown from '@/primitives/Dropdown'
import { KitCell, KitPage, KitSection } from './KitShell'

// Реальный примитив Dropdown — выпадающее меню действий по кнопке «⋯».
export default function DropdownKit() {
  return (
    <KitPage title="Dropdown">
      <KitSection title="Меню действий по «⋯»">
        <KitCell caption="обычный + danger">
          <Dropdown
            items={[
              { label: 'Сделать зрителем', onClick: () => {} },
              { label: 'Исключить', danger: true, onClick: () => {} },
            ]}
          />
        </KitCell>
        <KitCell caption="недоступный пункт → подсказка по клику">
          <Dropdown
            items={[
              {
                label: 'Сделать игроком',
                disabled: true,
                hint: 'Нет доступного слота',
                onClick: () => {},
              },
              { label: 'Исключить', danger: true, onClick: () => {} },
            ]}
          />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
