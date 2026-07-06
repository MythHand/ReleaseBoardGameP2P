import { PARALLAX_CARDS } from '@/cards/CardParallax'
import Avatar from '@/primitives/Avatar'
import styles from './PresetAvatar.module.css'

interface PresetAvatarProps {
  // source card id (preset id) whose art fills the avatar
  id: string
  // square side in px
  size?: number
  // muted (offline) look — the art is desaturated and dimmed
  muted?: boolean
}

// A stock avatar filled with a card's art — background + dim panel + illustration,
// composed statically (no parallax, no grid / decor) inside the square Avatar.
// Layers and dim level are read from PARALLAX_CARDS so nothing is duplicated.
export default function PresetAvatar({ id, size = 128, muted = false }: PresetAvatarProps) {
  const cfg = PARALLAX_CARDS[id]
  if (!cfg) return null

  return (
    <Avatar size={size}>
      <span className={`${styles.art} ${muted ? styles.muted : ''}`}>
        <img className={styles.bg} src={cfg.background.src} alt="" />
        <span className={styles.dim} style={{ opacity: cfg.panel.opacity }} />
        <img className={styles.illo} src={cfg.illustration.src} alt="" />
      </span>
    </Avatar>
  )
}
