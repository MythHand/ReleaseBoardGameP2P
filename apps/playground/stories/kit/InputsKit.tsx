import { useRef, useState } from 'react'
import { randomNickname, sanitizeNickname } from '@/game/nicknames'
import DiceIcon from '@/icons/DiceIcon'
import Button from '@/primitives/Button'
import Input, { type InputHandle } from '@/primitives/Input'
import { KitCell, KitPage, KitSection } from './KitShell'

// Реальный примитив Input во всех состояниях.
export default function InputsKit() {
  const [filled, setFilled] = useState('dimbo')
  const [nick, setNick] = useState('')

  // ошибка как на экранах подключения: пустое поле при сабмите дёргается (shake),
  // без красной заливки — именно так состояние ошибки сделано на Invite/Start
  const errRef = useRef<InputHandle>(null)
  const [errVal, setErrVal] = useState('')
  const submit = () => {
    if (!errVal.trim()) errRef.current?.shake()
  }

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

      <KitSection title="Регистр — капс (коды) или натуральный (plain)">
        <KitCell caption="капс — код игры">
          <Input label="код игры" defaultValue="4f2a-9k" />
        </KitCell>
        <KitCell caption="plain — никнейм как написан">
          <Input label="Ваш никнейм" defaultValue="Dimbo" plain />
        </KitCell>
      </KitSection>

      <KitSection title="Ошибка — два варианта">
        <KitCell caption="1 — тряска без красного и подписи (Invite/Start): сабмит пустого">
          <Input
            ref={errRef}
            label="код игры"
            value={errVal}
            onChange={(e) => setErrVal(e.target.value)}
            placeholder="напр. 4F2A-9K"
          />
          <Button variant="tech" onClick={submit}>
            подключиться
          </Button>
        </KitCell>
        <KitCell caption="2 — стандартная: красная рамка + подпись">
          <Input label="код игры" defaultValue="ZZ9" error="неверный код" />
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
