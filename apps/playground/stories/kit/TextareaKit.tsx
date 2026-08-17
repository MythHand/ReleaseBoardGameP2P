import { useRef, useState } from 'react'
import Button from '@/primitives/Button'
import Textarea, { type TextareaHandle } from '@/primitives/Textarea'
import { pick, useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from './KitShell'

// The real Textarea primitive: the multiline sibling of Input. Same field, same
// label, same trailing slot — the difference is that the text wraps and the
// height follows the content.
const COPY = {
  ru: {
    growSec: 'Высота по содержимому',
    growCap: 'пустое — в одну строку, растёт с каждой новой',
    placeholder: 'напишите несколько строк',
    capSec: 'Потолок роста (maxRows)',
    capCap: 'maxRows=3 — дальше поле прокручивается само',
    labelSec: 'С лейблом',
    labelCap: 'лейбл и поле связаны, как у Input',
    label: 'сообщение',
    trailingSec: 'С trailing-кнопкой',
    trailingCap: 'кнопка держит высоту одной строки и остаётся у нижнего края',
    send: 'отправить',
    errorSec: 'Ошибка',
    errorCap: 'красная рамка + тряска по кнопке',
    invalid: 'пустое сообщение',
    shake: 'тряхнуть',
  },
  en: {
    growSec: 'Height follows the content',
    growCap: 'one line when empty, grows with each new one',
    placeholder: 'type a few lines',
    capSec: 'Growth cap (maxRows)',
    capCap: 'maxRows=3 — past that the field scrolls itself',
    labelSec: 'With a label',
    labelCap: 'label and field are tied, same as Input',
    label: 'message',
    trailingSec: 'With a trailing button',
    trailingCap: 'the button keeps one-line height and stays at the bottom edge',
    send: 'send',
    errorSec: 'Error',
    errorCap: 'red border + shake on the button',
    invalid: 'message is empty',
    shake: 'shake',
  },
}

export default function TextareaKit() {
  const { lang } = useLang()
  const t = pick(lang, COPY)
  const [grow, setGrow] = useState('')
  const [capped, setCapped] = useState('')
  const [labelled, setLabelled] = useState('')
  const [composed, setComposed] = useState('')
  const errorRef = useRef<TextareaHandle>(null)

  return (
    <KitPage title="Textarea">
      <KitSection title={t.growSec}>
        <KitCell caption={t.growCap}>
          <Textarea
            value={grow}
            placeholder={t.placeholder}
            onChange={(e) => setGrow(e.target.value)}
          />
        </KitCell>
      </KitSection>

      <KitSection title={t.capSec}>
        <KitCell caption={t.capCap}>
          <Textarea
            maxRows={3}
            value={capped}
            placeholder={t.placeholder}
            onChange={(e) => setCapped(e.target.value)}
          />
        </KitCell>
      </KitSection>

      <KitSection title={t.labelSec}>
        <KitCell caption={t.labelCap}>
          <Textarea
            label={t.label}
            value={labelled}
            placeholder={t.placeholder}
            onChange={(e) => setLabelled(e.target.value)}
          />
        </KitCell>
      </KitSection>

      <KitSection title={t.trailingSec}>
        <KitCell caption={t.trailingCap}>
          <Textarea
            value={composed}
            placeholder={t.placeholder}
            onChange={(e) => setComposed(e.target.value)}
            trailing={
              <Button variant="icon" aria-label={t.send}>
                ↵
              </Button>
            }
          />
        </KitCell>
      </KitSection>

      <KitSection title={t.errorSec}>
        <KitCell caption={t.errorCap}>
          <Textarea ref={errorRef} error={t.invalid} placeholder={t.placeholder} />
          <Button variant="tech" onClick={() => errorRef.current?.shake()}>
            {t.shake}
          </Button>
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
