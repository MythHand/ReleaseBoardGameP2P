import { useEffect, useState } from 'react'
import styles from './TokenPreview.module.css'

// The same component is used by both the real app and the sandbox —
// demonstrating the "shared components, two entry points" principle.

interface ColorToken {
  name: string
  value: string
}

// Color values: hex, rgb/hsl/hwb, oklch/oklab/lab/lch, color-mix, and gradients.
const COLOR_RE =
  /^(#|rgb|hsl|hwb|okl|lab|lch|color-mix|(repeating-)?(linear|radial|conic)-gradient)/i

// Collect every color custom property from :root — including tokens pulled in
// via @import (CSSImportRule). The source is the live styles, so the showcase
// never drifts from tokens.css: we show exactly what's declared.
function collectVars(sheet: CSSStyleSheet, into: Map<string, string>): void {
  let rules: CSSRuleList
  try {
    rules = sheet.cssRules
  } catch {
    return // cross-origin sheet — skip
  }
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSImportRule && rule.styleSheet) {
      collectVars(rule.styleSheet, into)
    } else if (rule instanceof CSSStyleRule) {
      const { style } = rule
      for (let i = 0; i < style.length; i++) {
        const prop = style[i]
        if (!prop.startsWith('--') || into.has(prop)) continue
        const value = style.getPropertyValue(prop).trim()
        if (COLOR_RE.test(value)) into.set(prop, value)
      }
    }
  }
}

function readColorTokens(): ColorToken[] {
  const map = new Map<string, string>()
  for (const sheet of Array.from(document.styleSheets)) collectVars(sheet, map)
  return Array.from(map, ([name, value]) => ({ name, value }))
}

// Groups in display order. Bucketed by token-name prefix.
const GROUP_ORDER = [
  'Base & surfaces',
  'Brand & categories',
  'Named hues',
  'White overlays',
  'Black overlays',
  'Tinted overlays',
  'Gradients',
] as const

function groupOf(name: string): (typeof GROUP_ORDER)[number] {
  if (name === '--bg' || name === '--fg' || name === '--grid-line' || name.startsWith('--surface'))
    return 'Base & surfaces'
  if (name === '--brand-green' || name.startsWith('--cat-')) return 'Brand & categories'
  if (name.startsWith('--grad')) return 'Gradients'
  if (name.startsWith('--white-')) return 'White overlays'
  if (name.startsWith('--black-')) return 'Black overlays'
  // alpha variants of the hues carry a trailing -NN (--mint-40, --coral-12, --yellow-28…)
  if (/-\d/.test(name)) return 'Tinted overlays'
  return 'Named hues'
}

export default function TokenPreview() {
  // Styles are attached globally before mount, but we read in an effect just in
  // case (StrictMode / timing); the result is stable.
  const [tokens, setTokens] = useState<ColorToken[]>([])
  useEffect(() => setTokens(readColorTokens()), [])

  const groups = GROUP_ORDER.map((title) => ({
    title,
    items: tokens.filter((t) => groupOf(t.name) === title),
  })).filter((g) => g.items.length > 0)

  return (
    <section className={styles.root}>
      <h2 className={styles.h}>
        colors <span className={styles.note}>{`// ${tokens.length}`}</span>
      </h2>

      {groups.map((g) => (
        <div key={g.title} className={styles.group}>
          <div className={styles.groupH}>{g.title}</div>
          <div className={styles.grid}>
            {g.items.map((t) => (
              <div key={t.name} className={styles.swatch}>
                <div className={styles.chip}>
                  <div className={styles.checker} />
                  <div className={styles.fill} style={{ background: `var(${t.name})` }} />
                </div>
                <code className={styles.var}>{t.name}</code>
                <code className={styles.value}>{t.value}</code>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
