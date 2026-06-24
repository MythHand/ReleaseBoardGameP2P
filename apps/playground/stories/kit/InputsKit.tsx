import { useState } from 'react'
import { randomNickname, sanitizeNickname } from '@/game/nicknames'
import DiceIcon from '@/icons/DiceIcon'
import Button from '@/primitives/Button'
import Input from '@/primitives/Input'
import { KitCell, KitPage, KitSection } from './KitShell'

// Реальный примитив Input во всех состояниях.
export default function InputsKit() {
  const [filled, setFilled] = useState('dimbo')
  const [nick, setNick] = useState('')

  return (
    <KitPage title="Inputs">
      <KitSection title="Текстовое поле">
        <KitCell caption="empty">
          <Input label="Ваш никнейм" placeholder="напр. dimbo" />
        </KitCell>
        <KitCell caption="filled">
          <Input label="Ваш никнейм" value={filled} onChange={(e) => setFilled(e.target.value)} />
        </KitCell>
        <KitCell caption="no label">
          <Input placeholder="напр. 4F2A-9K" />
        </KitCell>
      </KitSection>

      <KitSection title="С trailing-кнопкой (иконочная по высоте поля)">
        <KitCell caption="ник + случайный (кубик)">
          <Input
            label="Ваш никнейм"
            value={nick}
            onChange={(e) => setNick(sanitizeNickname(e.target.value))}
            placeholder="напр. dimbo"
            maxLength={20}
            trailing={
              <Button
                variant="icon"
                aria-label="случайный ник"
                onClick={() => setNick(randomNickname())}
              >
                <DiceIcon />
              </Button>
            }
          />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
