import Menu, { MenuButton } from '@/primitives/Menu'
import { KitPage, KitSection } from './KitShell'

// Реальный примитив Menu: контейнер с навигацией стрелками ↑/↓ по дочерним
// MenuButton (так собрано меню действий на стартовом экране). Фокус едет за
// активным пунктом; Enter/Space активируют сфокусированный.
export default function MenuKit() {
  return (
    <KitPage title="Menu">
      <KitSection title="Меню действий — ↑/↓ переключают фокус, Enter активирует">
        <Menu>
          <MenuButton value="create">создать игру</MenuButton>
          <MenuButton value="join">присоединиться</MenuButton>
          <MenuButton value="rules">правила</MenuButton>
        </Menu>
      </KitSection>
    </KitPage>
  )
}
