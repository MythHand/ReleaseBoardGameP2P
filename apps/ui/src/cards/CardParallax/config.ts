import bgAttack from '@/assets/cards/parallax/background/attack.png'
import bgDefense from '@/assets/cards/parallax/background/defense.png'
import bgOperation from '@/assets/cards/parallax/background/git-operation.png'
import bgProtection from '@/assets/cards/parallax/background/protection.png'
import bgRelease from '@/assets/cards/parallax/background/release.png'
import bgSupport from '@/assets/cards/parallax/background/support.png'
import gridUrl from '@/assets/cards/parallax/base/grid.svg'
import attackIcon from '@/assets/cards/parallax/category/attack.svg'
import defenseIcon from '@/assets/cards/parallax/category/defense.svg'
import fastIcon from '@/assets/cards/parallax/category/fast.svg'
import operationIcon from '@/assets/cards/parallax/category/git-operation.svg'
import protectionIcon from '@/assets/cards/parallax/category/protection.svg'
import releaseIcon from '@/assets/cards/parallax/category/release.svg'
import supportIcon from '@/assets/cards/parallax/category/support.svg'
import backendArt from '@/assets/cards/parallax/illustration/backend.png'
import bugArt from '@/assets/cards/parallax/illustration/bug.png'
import codeReviewArt from '@/assets/cards/parallax/illustration/code-review.png'
import databaseArt from '@/assets/cards/parallax/illustration/database.png'
import ddosArt from '@/assets/cards/parallax/illustration/ddos.png'
import debuggerArt from '@/assets/cards/parallax/illustration/debugger.png'
import frontendArt from '@/assets/cards/parallax/illustration/frontend.png'
import gitBranchArt from '@/assets/cards/parallax/illustration/git-branch.png'
import gitCherryPickArt from '@/assets/cards/parallax/illustration/git-cherry-pick.png'
import gitMergeArt from '@/assets/cards/parallax/illustration/git-merge.png'
import gitRebaseArt from '@/assets/cards/parallax/illustration/git-rebase.png'
import hotfixArt from '@/assets/cards/parallax/illustration/hotfix.png'
import legacyCodeArt from '@/assets/cards/parallax/illustration/legacy-code.png'
import monitoringArt from '@/assets/cards/parallax/illustration/monitoring.png'
import notABugArt from '@/assets/cards/parallax/illustration/not-a-bug.png'
import outOfMemoryArt from '@/assets/cards/parallax/illustration/out-of-memory.png'
import prApprovedArt from '@/assets/cards/parallax/illustration/pr-approved.png'
import rollbackArt from '@/assets/cards/parallax/illustration/rollback.png'
import rubberDuckyArt from '@/assets/cards/parallax/illustration/rubber-ducky.png'
import securityBugArt from '@/assets/cards/parallax/illustration/security-bug.png'
import sudoArt from '@/assets/cards/parallax/illustration/sudo.png'
import systemUpgradeArt from '@/assets/cards/parallax/illustration/system-upgrade.png'
import worksOnMyMachineArt from '@/assets/cards/parallax/illustration/works-on-my-machine.png'

// Design reference frame — the card footprint. Every size / position below is in
// these design px; the component maps them to cqw so the whole face scales as a
// single unit at any display width (unified scale). Asset native sizes are used
// as-is and never distorted — anything larger than the frame overflows and is
// clipped by the card, and that overflow is intentional parallax headroom.
export const BASE_W = 368
export const BASE_H = 515

export interface ImageLayer {
  src: string
  // native pixel size of the asset (kept as-is, never distorted)
  w: number
  h: number
  // parallax depth — magnitude = how much it shifts, sign = direction.
  // positive follows the grid/base direction, negative inverts against it.
  depth: number
  // center offset in design px (0,0 = centered in the frame)
  x?: number
  y?: number
}

// Font sizes shared by ALL composed cards — one place so every card stays
// consistent (change here → every card changes). Family / weight / tracking are
// shared via the typography scale (bases card-title / body / body-sm).
export const CARD_FONT = {
  title: 34,
  description: 14,
  category: 13,
}

// LOD (simplified) variant, used when a card sits in the release zone. Derived
// from the full card: no category tag, no description, and the illustration is
// enlarged and dropped a little lower. Shared across every card.
export const LOD = {
  illustrationScale: 1.4,
  // design px lower than the full card's illustration — a delta, so each card's
  // own vertical position (incl. per-card nudges) carries into the LOD too
  illustrationYDrop: 36,
  titleScale: 1.2,
}

export interface TextLayer {
  // vertical anchor in design px — set exactly ONE:
  //   top    → distance from the top edge (e.g. the title)
  //   bottom → distance from the bottom edge (e.g. the description)
  top?: number
  bottom?: number
  // horizontal inset in design px (text is centered within it)
  padX: number
  depth: number
}

// Top-left category tag: an icon (its category colour is baked into the SVG)
// plus the category name in that same colour.
export interface CategoryLayer {
  icon: string
  // native icon px (kept as-is)
  w: number
  h: number
  // category name (language-agnostic) and its colour token for the label
  label: string
  accent: string
  // top-left position, in design px (font size comes from CARD_FONT.category)
  top: number
  left: number
  depth: number
}

// Lightning "fast play" mark in the top-right corner (colour baked into the SVG).
export interface FastLayer {
  icon: string
  w: number
  h: number
  // top-right position, in design px
  top: number
  right: number
  depth: number
}

export interface ParallaxCardConfig {
  background: ImageLayer
  grid: ImageLayer
  illustration: ImageLayer
  // radial-navy panel (gradient + blur + noise) muting the background image.
  // Styling lives in the module; per card we tune its parallax depth and its
  // own opacity (release panels sit at 0.9, protection at 0.58).
  panel: { depth: number; opacity: number }
  category: CategoryLayer
  // optional lightning mark (all Defense cards are played fast)
  fast?: FastLayer
  title: TextLayer
  description: TextLayer
}

// A category theme = the parts that differ between categories: the background
// image, how strongly its panel mutes that background, and the category tag.
// Everything else (grid, depths, text positions) is shared across all cards.
interface CardTheme {
  background: { src: string; w: number; h: number }
  panelOpacity: number
  category: { icon: string; w: number; h: number; label: string; accent: string }
  // whether cards of this category show the lightning "fast play" mark
  fast?: boolean
}

const RELEASE_THEME: CardTheme = {
  background: { src: bgRelease, w: 421, h: 627 },
  panelOpacity: 0.9,
  category: { icon: releaseIcon, w: 20, h: 14, label: 'Release', accent: 'var(--cat-release)' },
}

const PROTECTION_THEME: CardTheme = {
  background: { src: bgProtection, w: 419, h: 624 },
  panelOpacity: 0.58,
  category: {
    icon: protectionIcon,
    w: 16,
    h: 16,
    label: 'Protection',
    accent: 'var(--cat-protection)',
  },
}

const OPERATION_THEME: CardTheme = {
  background: { src: bgOperation, w: 416, h: 620 },
  panelOpacity: 0.6,
  category: {
    icon: operationIcon,
    w: 16,
    h: 16,
    label: 'Git Operation',
    accent: 'var(--cat-operation)',
  },
}

const DEFENSE_THEME: CardTheme = {
  background: { src: bgDefense, w: 417, h: 621 },
  panelOpacity: 0.71,
  category: { icon: defenseIcon, w: 16, h: 16, label: 'Defense', accent: 'var(--cat-defense)' },
  fast: true,
}

// Attack cards show the lightning by default; DDoS opts out via { fast: false }.
const ATTACK_THEME: CardTheme = {
  background: { src: bgAttack, w: 417, h: 621 },
  panelOpacity: 0.6,
  category: { icon: attackIcon, w: 15, h: 15, label: 'Attack', accent: 'var(--cat-attack)' },
  fast: true,
}

const SUPPORT_THEME: CardTheme = {
  background: { src: bgSupport, w: 418, h: 622 },
  panelOpacity: 0.6,
  category: { icon: supportIcon, w: 15, h: 15, label: 'Support', accent: 'var(--cat-support)' },
}

// shared vertical position of the illustration (design px); the per-card yNudge
// lowers it to balance each art
const ILLO_Y = -12

// The accepted BASE: the depth model and text positions here are the locked
// reference every composed card is tuned against. Per card, only the theme
// (category), the illustration (native size + optional yNudge) and — where a
// category has one — the subtype appended to the tag (e.g. "Defense / Unicorn").
function makeCard(
  theme: CardTheme,
  illustration: { src: string; w: number; h: number },
  opts: { yNudge?: number; subtype?: string; fast?: boolean } = {},
): ParallaxCardConfig {
  const { yNudge = 0, subtype, fast } = opts
  const label = subtype ? `${theme.category.label} / ${subtype}` : theme.category.label
  // theme decides the default; a card can opt out (e.g. DDoS has no lightning)
  const showFast = fast ?? theme.fast
  return {
    // Depth reads as recession INTO the card, not layers bulging out: deep
    // layers (background) parallax the MOST — the far floor behind the glass —
    // while surface layers (text) barely move, as if pinned to the card face.
    // Sign = direction (content inverted vs grid); magnitude = how deep it sits.
    background: { ...theme.background, depth: 0.9 },
    panel: { depth: -0.7, opacity: theme.panelOpacity },
    grid: { src: gridUrl, w: 443, h: 726, depth: 0.28 },
    illustration: { ...illustration, depth: 0.6, y: ILLO_Y + yNudge },
    // category tag — same surface depth as the text; position mirrors the PNG
    category: { ...theme.category, label, top: 20, left: 20, depth: 0.05 },
    fast: showFast ? { icon: fastIcon, w: 12, h: 15, top: 21, right: 22, depth: 0.05 } : undefined,
    title: { top: 52, padX: 21, depth: -0.14 },
    description: { bottom: 34, padX: 20, depth: -0.14 },
  }
}

// Illustration native sizes differ on purpose — that difference balances the
// visual weight of each card's art, so it is never normalised.
export const FRONTEND = makeCard(RELEASE_THEME, { src: frontendArt, w: 259, h: 259 })
export const BACKEND = makeCard(RELEASE_THEME, { src: backendArt, w: 282, h: 282 }, { yNudge: 10 })
export const DATABASE = makeCard(
  RELEASE_THEME,
  { src: databaseArt, w: 317, h: 317 },
  { yNudge: 20 },
)
export const MONITORING = makeCard(
  PROTECTION_THEME,
  { src: monitoringArt, w: 284, h: 284 },
  {
    yNudge: -7,
  },
)
export const DEBUGGER = makeCard(
  PROTECTION_THEME,
  { src: debuggerArt, w: 324, h: 324 },
  {
    yNudge: 3,
  },
)
export const SYSTEM_UPGRADE = makeCard(OPERATION_THEME, { src: systemUpgradeArt, w: 266, h: 266 })
export const GIT_BRANCH = makeCard(
  OPERATION_THEME,
  { src: gitBranchArt, w: 309, h: 309 },
  {
    yNudge: -7,
  },
)
export const GIT_MERGE = makeCard(OPERATION_THEME, { src: gitMergeArt, w: 246, h: 246 })
export const GIT_REBASE = makeCard(OPERATION_THEME, { src: gitRebaseArt, w: 267, h: 267 })
export const GIT_CHERRY_PICK = makeCard(
  OPERATION_THEME,
  { src: gitCherryPickArt, w: 280, h: 280 },
  {
    yNudge: -4,
  },
)
export const SECURITY_BUG = makeCard(
  ATTACK_THEME,
  { src: securityBugArt, w: 172, h: 172 },
  {
    yNudge: -35,
  },
)
export const DDOS = makeCard(
  ATTACK_THEME,
  { src: ddosArt, w: 238, h: 238 },
  {
    fast: false,
    yNudge: -8,
  },
)
export const BUG = makeCard(ATTACK_THEME, { src: bugArt, w: 221, h: 221 }, { yNudge: -13 })
export const LEGACY_CODE = makeCard(
  ATTACK_THEME,
  { src: legacyCodeArt, w: 228, h: 228 },
  {
    yNudge: -20,
  },
)
export const OUT_OF_MEMORY = makeCard(
  ATTACK_THEME,
  { src: outOfMemoryArt, w: 221, h: 221 },
  {
    yNudge: -11,
  },
)
export const SUDO = makeCard(SUPPORT_THEME, { src: sudoArt, w: 277, h: 277 }, { yNudge: 16 })
export const CODE_REVIEW = makeCard(
  SUPPORT_THEME,
  { src: codeReviewArt, w: 301, h: 301 },
  {
    yNudge: 1,
  },
)
export const NOT_A_BUG = makeCard(
  DEFENSE_THEME,
  { src: notABugArt, w: 196, h: 196 },
  {
    subtype: 'Unicorn',
  },
)
export const WORKS_ON_MY_MACHINE = makeCard(
  DEFENSE_THEME,
  { src: worksOnMyMachineArt, w: 309, h: 309 },
  { subtype: 'Unicorn' },
)
export const ROLLBACK = makeCard(
  DEFENSE_THEME,
  { src: rollbackArt, w: 214, h: 214 },
  {
    subtype: 'Cancel',
    yNudge: -24,
  },
)
export const HOTFIX = makeCard(
  DEFENSE_THEME,
  { src: hotfixArt, w: 258, h: 258 },
  {
    subtype: 'Cancel',
    yNudge: 7,
  },
)
export const PR_APPROVED = makeCard(
  DEFENSE_THEME,
  { src: prApprovedArt, w: 274, h: 274 },
  {
    subtype: 'Cancel',
    yNudge: 12,
  },
)
export const RUBBER_DUCKY = makeCard(
  DEFENSE_THEME,
  { src: rubberDuckyArt, w: 312, h: 312 },
  {
    subtype: 'Cancel',
    yNudge: 6,
  },
)

// Registry: card id → composed config. Ids absent here render as the PNG face.
export const PARALLAX_CARDS: Record<string, ParallaxCardConfig> = {
  'release-frontend': FRONTEND,
  'release-backend': BACKEND,
  'release-database': DATABASE,
  'protection-monitoring': MONITORING,
  'protection-debugger': DEBUGGER,
  'operation-system-upgrade': SYSTEM_UPGRADE,
  'operation-git-branch': GIT_BRANCH,
  'operation-git-merge': GIT_MERGE,
  'operation-git-rebase': GIT_REBASE,
  'operation-git-cherry-pick': GIT_CHERRY_PICK,
  'defense-not-a-bug': NOT_A_BUG,
  'defense-works-on-my-machine': WORKS_ON_MY_MACHINE,
  'defense-rollback': ROLLBACK,
  'defense-hotfix': HOTFIX,
  'defense-pr-approved': PR_APPROVED,
  'defense-rubber-ducky': RUBBER_DUCKY,
  'attack-security-bug': SECURITY_BUG,
  'attack-ddos': DDOS,
  'attack-bug': BUG,
  'attack-legacy-code': LEGACY_CODE,
  'attack-out-of-memory': OUT_OF_MEMORY,
  'support-sudo': SUDO,
  'support-code-review': CODE_REVIEW,
}
