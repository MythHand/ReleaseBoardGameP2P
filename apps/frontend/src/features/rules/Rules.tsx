import { useTranslation } from '@release/translation'
import { type RulesSection, Rules as RulesView } from '@release/ui'

// Thin i18n wrapper around the @release/ui Rules view: pulls translated copy and
// passes it as props, so search/filter/markup live in one place in the UI package.
export default function Rules() {
  const { t } = useTranslation()
  const meta = t('rules.meta', { returnObjects: true }) as string[]
  const sections = t('rules.sections', { returnObjects: true }) as RulesSection[]

  return (
    <RulesView
      meta={meta}
      sections={sections}
      foot={t('rules.foot')}
      searchPlaceholder={t('rules.searchPlaceholder')}
      notFoundText={t('rules.notFound')}
    />
  )
}
