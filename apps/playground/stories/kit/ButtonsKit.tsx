import DiceIcon from '@/icons/DiceIcon'
import Button, { CopyButton } from '@/primitives/Button'
import { useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from './KitShell'

// The real Button primitive in every variation.
const COPY = {
  ru: {
    primary: 'Primary — брекеты [ TEXT ]',
    createGame: 'создать игру',
    startGame: 'начать игру',
    tech: 'Tech — бордер-бокс',
    rules: 'правила',
    danger: 'Danger — деструктивные',
    dangerSolid: 'danger — сплошная (модалка)',
    dangerGhost: 'dangerGhost — серая → заливка (хедер)',
    disband: 'расформировать',
    icon: 'Icon — квадрат под высоту поля ввода',
    randomNick: 'случайный ник',
    copy: 'Copy — клик копирует, подпись на миг меняется',
    copied: 'скопировано',
    copyBtn: 'копировать',
  },
  en: {
    primary: 'Primary — brackets [ TEXT ]',
    createGame: 'create game',
    startGame: 'start game',
    tech: 'Tech — border box',
    rules: 'rules',
    danger: 'Danger — destructive',
    dangerSolid: 'danger — solid (modal)',
    dangerGhost: 'dangerGhost — gray → fill (header)',
    disband: 'disband',
    icon: 'Icon — square matching input height',
    randomNick: 'random nickname',
    copy: 'Copy — click copies, label flips briefly',
    copied: 'copied',
    copyBtn: 'copy',
  },
}

export default function ButtonsKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  return (
    <KitPage title="Buttons">
      <KitSection title={t.primary}>
        <KitCell caption="default">
          <Button>{t.createGame}</Button>
        </KitCell>
        <KitCell caption="disabled">
          <Button disabled>{t.startGame}</Button>
        </KitCell>
      </KitSection>

      <KitSection title={t.tech}>
        <KitCell caption="default">
          <Button variant="tech">{t.rules}</Button>
        </KitCell>
        <KitCell caption="disabled">
          <Button variant="tech" disabled>
            {t.rules}
          </Button>
        </KitCell>
      </KitSection>

      <KitSection title={t.danger}>
        <KitCell caption={t.dangerSolid}>
          <Button variant="danger">{t.disband}</Button>
        </KitCell>
        <KitCell caption={t.dangerGhost}>
          <Button variant="dangerGhost">{t.disband}</Button>
        </KitCell>
      </KitSection>

      <KitSection title={t.icon}>
        <KitCell caption="dice">
          <Button variant="icon" aria-label={t.randomNick}>
            <DiceIcon />
          </Button>
        </KitCell>
      </KitSection>

      <KitSection title={t.copy}>
        <KitCell caption="copyValue + copiedChildren">
          <CopyButton variant="tech" copyValue="RLS-7F3K" copiedChildren={t.copied}>
            {t.copyBtn}
          </CopyButton>
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
