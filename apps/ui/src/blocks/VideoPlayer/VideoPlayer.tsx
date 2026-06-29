import { type TransitionEvent, useEffect, useState } from 'react'
import Typography from '../../primitives/Typography'
import styles from './VideoPlayer.module.css'

export interface VideoPlayerCopy {
  // Caption under the play button + its aria-label.
  videoReview: string
  // Close button aria-label.
  close: string
  // <iframe> title (accessible name for the embed).
  title: string
}

export interface VideoPlayerProps {
  // Embed URL for the <iframe> (e.g. a YouTube /embed/ link).
  src: string
  copy: VideoPlayerCopy
  // Positioning / layout from the consumer — merged onto the player root.
  className?: string
}

// A play button that expands in place into an inline video embed. Owns its
// mount/open state, the Escape-to-close handler and the expand/collapse
// transition; i18n-agnostic (copy via props). Consumers place it via className.
export default function VideoPlayer({ src, copy, className = '' }: VideoPlayerProps) {
  const [videoMounted, setVideoMounted] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)

  const openVideo = () => {
    setVideoMounted(true)
    requestAnimationFrame(() => setVideoOpen(true))
  }
  const closeVideo = () => setVideoOpen(false)
  // Stay mounted until the collapse transition ends — avoids a jump on close.
  const onPlayerTransEnd = (e: TransitionEvent) => {
    if ((e.propertyName === 'inline-size' || e.propertyName === 'width') && !videoOpen) {
      setVideoMounted(false)
    }
  }

  useEffect(() => {
    if (!videoOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setVideoOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [videoOpen])

  return (
    <div
      className={`${styles.player} ${videoOpen ? styles.playerOpen : ''} ${className}`}
      onTransitionEnd={onPlayerTransEnd}
    >
      <button
        type="button"
        className={styles.playFace}
        onClick={openVideo}
        aria-label={copy.videoReview}
        tabIndex={videoMounted ? -1 : 0}
      >
        <span className={styles.playIcon}>▶</span>
        <Typography base="overline" tk="tk-22" className={styles.playCap}>
          {copy.videoReview}
        </Typography>
      </button>

      {videoMounted && (
        <div className={`${styles.videoFace} ${videoOpen ? styles.videoShown : ''}`}>
          <button
            type="button"
            className={styles.bigClose}
            onClick={closeVideo}
            aria-label={copy.close}
          >
            ✕
          </button>
          <iframe
            className={styles.iframe}
            src={src}
            title={copy.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      )}
    </div>
  )
}
