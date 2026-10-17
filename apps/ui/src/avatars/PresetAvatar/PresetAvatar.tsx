import { PARALLAX_CARDS } from '@/cards/CardParallax'
import Avatar from '@/primitives/Avatar'
import { type AvatarLayers, BUG_RUNNER_AVATARS } from './bugRunner'
import styles from './PresetAvatar.module.css'

// A card avatar's layers come from its card; the rest have their own images.
function layersOf(id: string): AvatarLayers | undefined {
  const card = PARALLAX_CARDS[id]
  if (card) {
    return {
      background: card.background.src,
      dim: card.panel.opacity,
      illustration: card.illustration.src,
    }
  }
  return BUG_RUNNER_AVATARS[id]
}

interface PresetAvatarProps {
  // preset id: a card whose art fills the avatar, or a Bug Runner preset
  id: string
  // square side in px
  size?: number
  // muted (offline) look — the art is desaturated and dimmed
  muted?: boolean
  // speaking in the voice chat — the ring around the square
  speaking?: boolean
}

// A stock avatar — background + dim panel + illustration, composed statically
// (no parallax, no grid / decor) inside the square Avatar. A card's layers and
// dim level are read from PARALLAX_CARDS so nothing is duplicated; a Bug Runner
// preset brings its own (bugRunner.ts).
export default function PresetAvatar({
  id,
  size = 128,
  muted = false,
  speaking = false,
}: PresetAvatarProps) {
  const layers = layersOf(id)
  if (!layers) return null

  return (
    <Avatar size={size} speaking={speaking}>
      <span className={`${styles.art} ${muted ? styles.muted : ''}`}>
        <img className={styles.bg} src={layers.background} alt="" />
        <span className={styles.dim} style={{ opacity: layers.dim }} />
        <img className={styles.illo} src={layers.illustration} alt="" />
      </span>
    </Avatar>
  )
}
