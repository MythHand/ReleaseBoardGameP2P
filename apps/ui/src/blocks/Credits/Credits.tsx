import Typography from '@/primitives/Typography'
import styles from './Credits.module.css'

// The authors' GitHub profiles (open in a new tab).
const DESIGN_URL = 'https://github.com/dimbo-design'
const DEV_URL = 'https://github.com/ditayler'
const CLAUDE_URL = 'https://github.com/anthropics/claude-code'

// Proper names — the same in every language, so they live here, not in copy.
const DESIGN_NAME = 'Togulev Dmitry'
const DEV_NAME = 'Andrey Konnov'
const CLAUDE_NAME = 'Claude'

export interface CreditsCopy {
  authorDesign: string
  authorDev: string
  // the label of the version line — needed only with `version`
  version?: string
}

interface CreditsProps {
  copy: CreditsCopy
  // The game's version, as the consumer's build knows it. Without it (or its
  // label) the line is left out — the library has no build of its own to ask.
  version?: string
  // the block's place on the screen — it has no position of its own
  className?: string
}

function Person({ href, name }: { href: string; name: string }) {
  return (
    <a className={styles.link} href={href} target="_blank" rel="noopener noreferrer">
      {name}
    </a>
  )
}

// Who made the game: two lines, a label and the names, each name a link to its
// GitHub profile — and under them, the version. The start screen puts it in its
// bottom-left corner.
export default function Credits({ copy, version, className = '' }: CreditsProps) {
  return (
    <div className={`${styles.credits} ${className}`}>
      <Typography as="span" base="mono-sm" tk="tk-04" className={styles.credit}>
        <Typography as="span" base="label" tk="tk-16" className={styles.label}>
          {copy.authorDesign}
        </Typography>
        <Person href={DESIGN_URL} name={DESIGN_NAME} />
      </Typography>
      <Typography as="span" base="mono-sm" tk="tk-04" className={styles.credit}>
        <Typography as="span" base="label" tk="tk-16" className={styles.label}>
          {copy.authorDev}
        </Typography>
        <span>
          <Person href={CLAUDE_URL} name={CLAUDE_NAME} />
          {', '}
          <Person href={DEV_URL} name={DEV_NAME} />
          {', '}
          <Person href={DESIGN_URL} name={DESIGN_NAME} />
        </span>
      </Typography>
      {version && copy.version && (
        <Typography as="span" base="mono-sm" tk="tk-04" className={styles.credit}>
          <Typography as="span" base="label" tk="tk-16" className={styles.label}>
            {copy.version}
          </Typography>
          <span className={styles.value}>{version}</span>
        </Typography>
      )}
    </div>
  )
}
