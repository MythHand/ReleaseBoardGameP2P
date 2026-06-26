import { Rules as RulesView } from '@release/ui'

// Единый источник правил — готовый компонент @release/ui Rules (тот же, что и
// превью «Rules» в playground и панель «правила» на столе). RU-текст зашит в
// компоненте; EN подключится позже через его copy-пропсы (UI i18n-агностичен).
export default function Rules() {
  return <RulesView />
}
