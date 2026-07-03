import bgRelease from '@/assets/cards/parallax/background/release.png'
import gridUrl from '@/assets/cards/parallax/base/grid.svg'
import releaseIcon from '@/assets/cards/parallax/category/release.svg'
import backendArt from '@/assets/cards/parallax/illustration/backend.png'
import databaseArt from '@/assets/cards/parallax/illustration/database.png'
import frontendArt from '@/assets/cards/parallax/illustration/frontend.png'

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

export interface ParallaxCardConfig {
  background: ImageLayer
  grid: ImageLayer
  illustration: ImageLayer
  // radial-navy panel (gradient + blur + noise) — styling lives in the module,
  // only its parallax depth is tuned per card here
  panel: { depth: number }
  category: CategoryLayer
  title: TextLayer
  description: TextLayer
}

// Every Release card shares the same layers, category tag, depths and text
// positions — only the illustration (and its native size) differs. This factory
// is the accepted BASE: the depth model and positions here are the locked
// reference the whole category is tuned against.
// shared vertical position of the release illustration (design px); the
// per-card yNudge lowers it to balance each art
const RELEASE_ILLO_Y = -12

function makeReleaseCard(
  illustration: { src: string; w: number; h: number },
  yNudge = 0,
): ParallaxCardConfig {
  return {
    // Depth reads as recession INTO the card, not layers bulging out: deep
    // layers (background) parallax the MOST — the far floor behind the glass —
    // while surface layers (text) barely move, as if pinned to the card face.
    // Sign = direction (content inverted vs grid); magnitude = how deep it sits.
    background: { src: bgRelease, w: 421, h: 627, depth: 0.9 },
    panel: { depth: -0.7 },
    grid: { src: gridUrl, w: 443, h: 726, depth: 0.28 },
    illustration: { ...illustration, depth: 0.6, y: RELEASE_ILLO_Y + yNudge },
    // category tag — same surface depth as the text; position mirrors the PNG
    category: {
      icon: releaseIcon,
      w: 20,
      h: 14,
      label: 'Release',
      accent: 'var(--cat-release)',
      top: 20,
      left: 20,
      depth: 0.05,
    },
    title: { top: 52, padX: 24, depth: -0.14 },
    description: { bottom: 34, padX: 34, depth: -0.14 },
  }
}

// Illustration native sizes differ on purpose — that difference balances the
// visual weight of each card's art, so it is never normalised.
export const FRONTEND = makeReleaseCard({ src: frontendArt, w: 259, h: 259 })
export const BACKEND = makeReleaseCard({ src: backendArt, w: 282, h: 282 }, 10)
export const DATABASE = makeReleaseCard({ src: databaseArt, w: 317, h: 317 }, 20)

// Registry: card id → composed config. Ids absent here render as the PNG face.
export const PARALLAX_CARDS: Record<string, ParallaxCardConfig> = {
  'release-frontend': FRONTEND,
  'release-backend': BACKEND,
  'release-database': DATABASE,
}
