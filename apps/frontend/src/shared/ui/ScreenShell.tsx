import {
  HudBackground,
  LangSwitcher,
  PhysicalEdition,
  type PhysicalEditionCopy,
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
  // language + setter: when both are given, the corner switch is drawn
  lang?: SwitchLang
  onLangChange?: (lang: SwitchLang) => void
  // printed-edition plate in the bottom-right; omitted when no copy is given
  physicalEditionCopy?: PhysicalEditionCopy
  // other absolutely-positioned blocks of the screen (video player, credits)
  corners?: ReactNode
  // the column body under the description — its own top gap is its own, since
  // .desc carries none
  children?: ReactNode
}

// The screen frame shared by /start and /lobby/:lobbyId: layered background,
// language corner, and the left column down to the description.
export default function ScreenShell({
  tags,
  description,
  lang,
  onLangChange,
  physicalEditionCopy,
  corners,
  children,
}: ScreenShellProps) {
  return (
    <div className={styles.root}>
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
          <Typography base="body" as="p" className={styles.desc}>
            {description}
          </Typography>
          {children}
        </div>
      </div>

      {corners}

      {physicalEditionCopy && (
        <PhysicalEdition
          href={INSTAGRAM_URL}
          copy={physicalEditionCopy}
          className={styles.physical}
        />
      )}
    </div>
  )
}
