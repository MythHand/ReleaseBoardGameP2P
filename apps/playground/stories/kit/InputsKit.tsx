import { useRef, useState } from 'react'
import { randomNickname, sanitizeNickname } from '@/game/nicknames'
import DiceIcon from '@/icons/DiceIcon'
import Button from '@/primitives/Button'
import Input, { type InputHandle } from '@/primitives/Input'
import { useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from './KitShell'

// The real Input primitive in every state.
const COPY = {
  ru: {
    textField: 'Текстовое поле',
    nick: 'Ваш никнейм',
    egNick: 'напр. dimbo',
    egCode: 'напр. 4F2A-9K',
    caseSec: 'Регистр — капс (коды) или натуральный (plain)',
    capsCap: 'капс — код игры',
    plainCap: 'plain — никнейм как написан',
    gameCode: 'код игры',
    errorSec: 'Ошибка — два варианта',
    err1Cap: '1 — тряска без красного и подписи (Invite/Start): сабмит пустого',
    connect: 'подключиться',
    err2Cap: '2 — стандартная: красная рамка + подпись',
    invalidCode: 'неверный код',
    trailingSec: 'С trailing-кнопкой (иконочная по высоте поля)',
    randomCap: 'ник + случайный (кубик)',
    randomNick: 'случайный ник',
  },
  en: {
    textField: 'Text field',
    nick: 'Your nickname',
    egNick: 'e.g. dimbo',
    egCode: 'e.g. 4F2A-9K',
    caseSec: 'Case — caps (codes) or natural (plain)',
    capsCap: 'caps — game code',
    plainCap: 'plain — nickname as typed',
    gameCode: 'game code',
    errorSec: 'Error — two variants',
    err1Cap: '1 — shake, no red or label (Invite/Start): submit empty',
    connect: 'connect',
    err2Cap: '2 — standard: red border + label',
    invalidCode: 'invalid code',
    trailingSec: 'With a trailing button (icon matching field height)',
    randomCap: 'nickname + random (dice)',
    randomNick: 'random nickname',
  },
}

export default function InputsKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  const [filled, setFilled] = useState('dimbo')
  const [nick, setNick] = useState('')

  // error like on the connection screens: an empty field shakes on submit
  // (no red fill) — exactly how the error state is done on Invite/Start
  const errRef = useRef<InputHandle>(null)
  const [errVal, setErrVal] = useState('')
  const submit = () => {
    if (!errVal.trim()) errRef.current?.shake()
  }

  return (
    <KitPage title="Inputs">
      <KitSection title={t.textField}>
        <KitCell caption="empty">
          <Input label={t.nick} placeholder={t.egNick} />
        </KitCell>
        <KitCell caption="filled">
          <Input label={t.nick} value={filled} onChange={(e) => setFilled(e.target.value)} />
        </KitCell>
        <KitCell caption="no label">
          <Input placeholder={t.egCode} />
        </KitCell>
      </KitSection>

      <KitSection title={t.caseSec}>
        <KitCell caption={t.capsCap}>
          <Input label={t.gameCode} defaultValue="4f2a-9k" />
        </KitCell>
        <KitCell caption={t.plainCap}>
          <Input label={t.nick} defaultValue="Dimbo" plain />
        </KitCell>
      </KitSection>

      <KitSection title={t.errorSec}>
        <KitCell caption={t.err1Cap}>
          <Input
            ref={errRef}
            label={t.gameCode}
            value={errVal}
            onChange={(e) => setErrVal(e.target.value)}
            placeholder={t.egCode}
          />
          <Button variant="tech" onClick={submit}>
            {t.connect}
          </Button>
        </KitCell>
        <KitCell caption={t.err2Cap}>
          <Input label={t.gameCode} defaultValue="ZZ9" error={t.invalidCode} />
        </KitCell>
      </KitSection>

      <KitSection title={t.trailingSec}>
        <KitCell caption={t.randomCap}>
          <Input
            label={t.nick}
            value={nick}
            onChange={(e) => setNick(sanitizeNickname(e.target.value))}
            placeholder={t.egNick}
            maxLength={20}
            trailing={
              <Button
                variant="icon"
                aria-label={t.randomNick}
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
