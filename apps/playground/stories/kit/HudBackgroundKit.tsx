import HudBackground from '@/primitives/HudBackground'
import Typography from '@/primitives/Typography'
import { pick, useLang } from '../../Playground/lang'
import styles from './HudBackgroundKit.module.css'
import { KitCell, KitPage, KitSection } from './KitShell'

export default function HudBackgroundKit() {
  const { lang } = useLang()
  const w = pick(lang, {
    ru: {
      states: 'Состояния',
      neutral: 'нейтральное',
      positive: 'позитивное',
      grid: 'сетка (прозрачное)',
      glowT: 'Glow (черновик) — под позитивное',
      glowCap: 'позитивное + glow',
      label: 'фон',
    },
    en: {
      states: 'States',
      neutral: 'neutral',
      positive: 'positive',
      grid: 'grid (transparent)',
      glowT: 'Glow (draft) — for positive',
      glowCap: 'positive + glow',
      label: 'background',
    },
  })

  const label = (
    <Typography base="label-md" tk="tk-22" className={styles.demoLabel}>
      {w.label}
    </Typography>
  )

  return (
    <KitPage title="HUD background" tag="ui kit">
      <KitSection title={w.states}>
        <KitCell caption={w.neutral}>
          <HudBackground tone="neutral" className={styles.demo}>
            {label}
          </HudBackground>
        </KitCell>
        <KitCell caption={w.positive}>
          <HudBackground tone="positive" className={styles.demo}>
            {label}
          </HudBackground>
        </KitCell>
        <KitCell caption={w.grid}>
          <HudBackground tone="grid" className={styles.demo}>
            {label}
          </HudBackground>
        </KitCell>
      </KitSection>

      <KitSection title={w.glowT}>
        <KitCell caption={w.glowCap}>
          <HudBackground tone="positive" glow className={styles.demo}>
            {label}
          </HudBackground>
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
