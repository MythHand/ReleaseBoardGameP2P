import DiceIcon from '@/icons/DiceIcon'
import Button from '@/primitives/Button'
import { KitCell, KitPage, KitSection } from './KitShell'

// Реальный примитив Button во всех вариациях.
export default function ButtonsKit() {
  return (
    <KitPage title="Buttons">
      <KitSection title="Primary — брекеты [ TEXT ]">
        <KitCell caption="default">
          <Button>создать игру</Button>
        </KitCell>
        <KitCell caption="disabled">
          <Button disabled>начать игру</Button>
        </KitCell>
      </KitSection>

      <KitSection title="Tech — бордер-бокс">
        <KitCell caption="default">
          <Button variant="tech">правила</Button>
        </KitCell>
        <KitCell caption="disabled">
          <Button variant="tech" disabled>
            правила
          </Button>
        </KitCell>
      </KitSection>

      <KitSection title="Danger — деструктивные">
        <KitCell caption="danger — сплошная (модалка)">
          <Button variant="danger">расформировать</Button>
        </KitCell>
        <KitCell caption="dangerGhost — серая → заливка (хедер)">
          <Button variant="dangerGhost">расформировать</Button>
        </KitCell>
      </KitSection>

      <KitSection title="Icon — квадрат под высоту поля ввода">
        <KitCell caption="dice">
          <Button variant="icon" aria-label="случайный ник">
            <DiceIcon />
          </Button>
        </KitCell>
      </KitSection>

      <KitSection title="Copy — клик копирует, подпись на миг меняется">
        <KitCell caption="copyValue + copiedChildren">
          <Button variant="tech" copyValue="RLS-7F3K" copiedChildren="скопировано">
            копировать
          </Button>
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
