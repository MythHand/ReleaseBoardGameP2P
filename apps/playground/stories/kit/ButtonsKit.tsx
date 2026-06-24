import DiceIcon from '@/icons/DiceIcon'
import Button from '@/primitives/Button'
import styles from './ButtonsKit.module.css'
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
        <KitCell caption="danger">
          <Button variant="tech" className={styles.danger}>
            расформировать
          </Button>
        </KitCell>
      </KitSection>

      <KitSection title="Icon — квадрат под высоту поля ввода">
        <KitCell caption="dice">
          <Button variant="icon" aria-label="случайный ник">
            <DiceIcon />
          </Button>
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
