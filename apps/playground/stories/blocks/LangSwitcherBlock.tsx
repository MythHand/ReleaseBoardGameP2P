import LangSwitcher from '@/blocks/LangSwitcher'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'

// Блок «язык»: метка + две кнопки RU / EN. Завязан на глобальный язык
// плейграунда — переключение здесь реально меняет язык всех стори.
export default function LangSwitcherBlock() {
  const { lang, setLang } = useLang()
  const label = pick(lang, { ru: 'язык', en: 'language' })

  return (
    <KitPage title="Lang switcher" tag="блок">
      <KitSection title="Язык">
        <LangSwitcher value={lang} onChange={setLang} label={label} />
      </KitSection>
    </KitPage>
  )
}
