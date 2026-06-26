import { useTranslation } from '@release/translation'
import { RULES_COPY_EN, RULES_COPY_RU, Rules as RulesView } from '@release/ui'

// Правила берутся из готового @release/ui Rules; текст выбирается по текущему
// языку i18next (тот же компонент, что в playground и панель «правила» на столе).
export default function Rules() {
  const { i18n } = useTranslation()
  const copy = i18n.language.startsWith('en') ? RULES_COPY_EN : RULES_COPY_RU
  return <RulesView copy={copy} />
}
