import HudSurface from '@/primitives/HudSurface'
import Typography from '@/primitives/Typography'
import { pick, useLang } from '../../Playground/lang'
import styles from './HudSurfaceKit.module.css'
import { KitCell, KitPage, KitSection } from './KitShell'

export default function HudSurfaceKit() {
  const { lang } = useLang()
  const w = pick(lang, {
    ru: { accents: 'Акценты состояний', glow: 'Bloom', label: 'панель' },
    en: { accents: 'State accents', glow: 'Bloom', label: 'panel' },
  })

  const label = (
    <Typography base="label-md" tk="tk-22" className={styles.demoLabel}>
      {w.label}
    </Typography>
  )

  return (
    <KitPage title="HUD surface" tag="ui kit">
      <KitSection title={w.accents}>
        <KitCell caption="turn">
          <HudSurface accent="var(--turn-accent)" className={styles.demo}>
            {label}
          </HudSurface>
        </KitCell>
        <KitCell caption="reaction">
          <HudSurface accent="var(--reaction-accent)" className={styles.demo}>
            {label}
          </HudSurface>
        </KitCell>
        <KitCell caption="danger">
          <HudSurface accent="var(--danger-accent)" className={styles.demo}>
            {label}
          </HudSurface>
        </KitCell>
        <KitCell caption="idle">
          <HudSurface accent="var(--idle-accent)" className={styles.demo}>
            {label}
          </HudSurface>
        </KitCell>
      </KitSection>

      <KitSection title={w.glow}>
        <KitCell caption="glow">
          <HudSurface className={styles.demo}>{label}</HudSurface>
        </KitCell>
        <KitCell caption="no glow">
          <HudSurface glow={false} className={styles.demo}>
            {label}
          </HudSurface>
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
