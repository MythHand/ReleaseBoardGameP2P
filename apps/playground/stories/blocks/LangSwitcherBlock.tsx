import LangSwitcher from '@/blocks/LangSwitcher'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'

// The "language" block: a label + two RU / EN buttons. Wired to the playground's
// global language — switching here actually changes the language of all stories.
export default function LangSwitcherBlock() {
  const { lang, setLang } = useLang()
  const label = pick(lang, { ru: 'язык', en: 'language' })

  return (
    <KitPage title="Lang switcher" tag="block">
      <KitSection
        title={pick(lang, { ru: 'Компактный (code) — RU / EN', en: 'Compact (code) — RU / EN' })}
      >
        <LangSwitcher value={lang} onChange={setLang} label={label} />
      </KitSection>

      <KitSection
        title={pick(lang, { ru: 'Широкий (full) — полные имена', en: 'Wide (full) — full names' })}
      >
        <LangSwitcher value={lang} onChange={setLang} variant="full" />
      </KitSection>
    </KitPage>
  )
}
