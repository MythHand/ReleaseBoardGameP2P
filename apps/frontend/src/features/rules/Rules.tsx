import { useTranslation } from '@release/translation'
import { Rules as RulesView } from '@release/ui'

// Правила берутся из готового @release/ui Rules; текст — из центрального каталога
// (namespace `rulesBlock`) через i18next (тот же компонент, что в playground и
// панель «правила» на столе).
export default function Rules() {
  const { t } = useTranslation()
  const copy = t('rulesBlock', { returnObjects: true })
  return <RulesView copy={copy} />
}
