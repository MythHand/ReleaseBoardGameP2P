import { useTranslation } from '@release/translation'
import {
  HudBackground,
  LangSwitcher,
  PhysicalEdition,
  type SwitchLang,
  Typography,
} from '@release/ui'
import type { ReactNode } from 'react'
import AppLogo from './AppLogo'
import styles from './ScreenShell.module.css'

// Ordering/pre-ordering the printed edition goes through the team's Instagram.
const INSTAGRAM_URL = 'https://www.instagram.com/mythhand.team/'

interface ScreenShellProps {
  tags: string[]
  description: string
  // Column rhythm. 'hero' is the design's reference scale (the playground's
  // start screen). 'compact' is for screens whose body is too tall to sit under
  // a 480px logo — the invite form would otherwise push its CTA below the fold.
  density?: 'hero' | 'compact'
  // language + setter: when both are given, the corner switch is drawn
  lang?: SwitchLang
  onLangChange?: (lang: SwitchLang) => void
  // other absolutely-positioned blocks of the screen (video player, credits)
  corners?: ReactNode
  // the column body under the description — its own top gap is its own, since
  // .desc carries none
  children?: ReactNode
}

// The screen frame shared by /start and /lobby/:lobbyId: layered background,
// language corner, the left column down to the description, and the
// printed-edition plate. The plate is part of the frame rather than a prop —
// both screens show it with the same copy from the same catalog key, so passing
// it in only gave the two a way to drift apart.
export default function ScreenShell({
  tags,
  description,
  density = 'hero',
  lang,
  onLangChange,
  corners,
  children,
}: ScreenShellProps) {
  const { t } = useTranslation()
  const compact = density === 'compact'
  return (
    <div className={`${styles.root} ${compact ? styles.compact : ''}`}>
      <div className={styles.bg} />
      <div className={styles.blur} />
      <div className={styles.scrim} />
      <HudBackground tone="grid" className={styles.bgLayer} />

      {lang && onLangChange && (
        <>
          <div className={styles.langShade} />
          <div className={styles.langCorner}>
            <LangSwitcher value={lang} onChange={onLangChange} />
          </div>
        </>
      )}

      <div className={styles.content}>
        <div className={styles.col}>
          <AppLogo className={styles.logo} />
          <div className={styles.tags}>
            {tags.map((tag) => (
              <Typography key={tag} variant="tag">
                {tag}
              </Typography>
            ))}
          </div>
          <Typography base={compact ? 'body' : 'body-lg'} as="p" className={styles.desc}>
            {description}
          </Typography>
          {children}
        </div>
      </div>

      {corners}

      <PhysicalEdition
        href={INSTAGRAM_URL}
        copy={t('physicalEdition', { returnObjects: true })}
        className={styles.physical}
      />
    </div>
  )
}
