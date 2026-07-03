import StatusDot from '@/primitives/StatusDot'
import { pick, useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from './KitShell'

export default function StatusDotKit() {
  const { lang } = useLang()
  const w = pick(lang, {
    ru: { accents: 'Акценты состояний', pulse: 'Пульс', sizes: 'Размеры' },
    en: { accents: 'State accents', pulse: 'Pulse', sizes: 'Sizes' },
  })

  return (
    <KitPage title="Status dot" tag="ui kit">
      <KitSection title={w.accents}>
        <KitCell caption="turn">
          <StatusDot accent="var(--turn-accent)" />
        </KitCell>
        <KitCell caption="reaction">
          <StatusDot accent="var(--reaction-accent)" />
        </KitCell>
        <KitCell caption="danger">
          <StatusDot accent="var(--danger-accent)" />
        </KitCell>
        <KitCell caption="idle">
          <StatusDot accent="var(--idle-accent)" />
        </KitCell>
      </KitSection>

      <KitSection title={w.pulse}>
        <KitCell caption="pulse">
          <StatusDot />
        </KitCell>
        <KitCell caption="static">
          <StatusDot pulse={false} />
        </KitCell>
      </KitSection>

      <KitSection title={w.sizes}>
        <KitCell caption="8">
          <StatusDot size={8} />
        </KitCell>
        <KitCell caption="12">
          <StatusDot size={12} />
        </KitCell>
        <KitCell caption="16">
          <StatusDot size={16} />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
