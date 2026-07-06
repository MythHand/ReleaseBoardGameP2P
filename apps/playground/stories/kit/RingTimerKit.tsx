import RingTimer from '@/primitives/RingTimer'
import { pick, useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from './KitShell'

export default function RingTimerKit() {
  const { lang } = useLang()
  const w = pick(lang, {
    ru: { progress: 'Прогресс', accents: 'Акценты состояний', sizes: 'Размеры' },
    en: { progress: 'Progress', accents: 'State accents', sizes: 'Sizes' },
  })

  return (
    <KitPage title="Ring timer" tag="ui kit">
      <KitSection title={w.progress}>
        <KitCell caption="0.85">
          <RingTimer progress={0.85} value={25} />
        </KitCell>
        <KitCell caption="0.5">
          <RingTimer progress={0.5} value={12} />
        </KitCell>
        <KitCell caption="0.15">
          <RingTimer progress={0.15} value={3} />
        </KitCell>
      </KitSection>

      <KitSection title={w.accents}>
        <KitCell caption="turn">
          <RingTimer progress={0.7} value={16} accent="var(--turn-accent)" />
        </KitCell>
        <KitCell caption="reaction">
          <RingTimer progress={0.4} value={8} accent="var(--reaction-accent)" />
        </KitCell>
        <KitCell caption="danger">
          <RingTimer progress={0.2} value={4} accent="var(--danger-accent)" />
        </KitCell>
        <KitCell caption="idle">
          <RingTimer progress={0.9} value={25} accent="var(--idle-accent)" />
        </KitCell>
      </KitSection>

      <KitSection title={w.sizes}>
        <KitCell caption="56">
          <RingTimer progress={0.6} value={9} size={56} />
        </KitCell>
        <KitCell caption="72">
          <RingTimer progress={0.6} value={9} size={72} />
        </KitCell>
        <KitCell caption="96">
          <RingTimer progress={0.6} value={9} size={96} />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
