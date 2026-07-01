import Menu, { MenuButton, MenuGroup } from '@/blocks/Menu'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'

// The Menu block: the start screen's actions menu. Items are grouped (as on the
// start screen): the create/join pair, the lone "rules", the GitHub/Playground
// pair — a larger gap between groups, a smaller one within. ↑/↓ navigation runs
// through all items in order, Enter/Space activate. A composite over the Button primitive.
export default function MenuBlock() {
  const { lang } = useLang()
  const t = pick(lang, {
    ru: {
      section: 'Меню действий старта — ↑/↓ переключают фокус, Enter активирует',
      create: 'создать игру',
      join: 'подключиться',
      rules: 'правила',
    },
    en: {
      section: 'Start actions menu — ↑/↓ move focus, Enter activates',
      create: 'create game',
      join: 'join',
      rules: 'rules',
    },
  })

  return (
    <KitPage title="Menu" tag="block">
      <KitSection title={t.section}>
        <Menu>
          <MenuGroup>
            <MenuButton value="create">{t.create}</MenuButton>
            <MenuButton value="join">{t.join}</MenuButton>
          </MenuGroup>
          <MenuGroup>
            <MenuButton value="rules">{t.rules}</MenuButton>
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
