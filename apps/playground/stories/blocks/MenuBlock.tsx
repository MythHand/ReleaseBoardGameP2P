import Menu, { MenuButton, MenuGroup } from '@/blocks/Menu'
import { KitPage, KitSection } from '../kit/KitShell'

// Блок Menu: меню действий стартового экрана. Пункты сгруппированы (как на старте):
// пара «создать/подключиться», одиночка «правила», пара «GitHub/Playground» — между
// группами больший отступ, внутри группы — меньший. Навигация ↑/↓ идёт сквозь все
// пункты по порядку, Enter/Space активируют. Композит над примитивом Button.
export default function MenuBlock() {
  return (
    <KitPage title="Menu" tag="блок">
      <KitSection title="Меню действий старта — ↑/↓ переключают фокус, Enter активирует">
        <Menu>
          <MenuGroup>
            <MenuButton value="create">создать игру</MenuButton>
            <MenuButton value="join">подключиться</MenuButton>
          </MenuGroup>
          <MenuGroup>
            <MenuButton value="rules">правила</MenuButton>
          </MenuGroup>
          <MenuGroup>
            <MenuButton value="github">GitHub</MenuButton>
            <MenuButton value="playground">Playground</MenuButton>
          </MenuGroup>
        </Menu>
      </KitSection>
    </KitPage>
  )
}
