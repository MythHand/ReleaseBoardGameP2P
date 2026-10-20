import { useState } from 'react'
import preview from '@/assets/rules/rules-video-preview.png'
import styles from './RulesVideo.module.css'

// BoardGameLab's rules breakdown. The same embed form and player settings as
// the start screen's video (VideoPlayer).
const VIDEO_URL = 'https://www.youtube.com/embed/YPYbkgJZfdI?autoplay=1'

export interface RulesVideoCopy {
  // accessible name of the play button
  play: string
  // accessible name of the player
  title: string
}

// The rules breakdown at the head of the rules. Until it is pressed it is the
// preview frame kept in the project, so opening the rules asks nothing of
// YouTube; the press puts the player in its place, at the same width.
export default function RulesVideo({ copy }: { copy: RulesVideoCopy }) {
  const [playing, setPlaying] = useState(false)
  return (
    <div className={styles.video}>
      {playing ? (
        <iframe
          className={styles.player}
          src={VIDEO_URL}
          title={copy.title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className={styles.preview}
          onClick={() => setPlaying(true)}
          aria-label={copy.play}
        >
          <img className={styles.frame} src={preview} alt="" draggable={false} />
          <span className={styles.play} aria-hidden="true">
            <span className={styles.playIcon}>▶</span>
          </span>
        </button>
      )}
    </div>
  )
}
