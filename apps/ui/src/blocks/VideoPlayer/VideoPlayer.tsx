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
  // Positioning from the consumer — merged onto the (invisible) container.
  className?: string
}

// One morphing frame with two states — a circular play button and an expanded
// video viewer. The frame's border/background is shared; opening only swaps the
// inner content (play icon → iframe). Choreography:
//  - open  (~600ms): frame grows with a slight anticipation; the border thins and
//    the video fades in only near the end (~90%); the close button appears strictly
//    once the frame is fully expanded (size transition end).
//  - close (~500ms): the video hides first, then the frame collapses after a short
//    beat (not waiting for the video to finish).
// An invisible container reserves the expanded reel footprint; the caption sits a
// layer beneath the frame.
export default function VideoPlayer({ src, copy, className = '' }: VideoPlayerProps) {
  const [mounted, setMounted] = useState(false) // iframe in the DOM
  const [open, setOpen] = useState(false) // morph target = expanded
  const [expanded, setExpanded] = useState(false) // morph FINISHED expanding

  const openVideo = () => {
    setMounted(true)
    requestAnimationFrame(() => setOpen(true))
  }
  const closeVideo = () => {
    setExpanded(false) // close button hides immediately on click
    setOpen(false)
  }
  const onFrameTransEnd = (e: TransitionEvent) => {
    // Drive state off the size transition only (one of the several morph props).
    if (e.propertyName !== 'inline-size' && e.propertyName !== 'width') return
    if (open)
      setExpanded(true) // fully expanded → close button may appear
    else setMounted(false) // fully collapsed → drop the iframe
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setExpanded(false)
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className={`${styles.videoPlayer} ${className}`}>
      {/* подпись — слой ниже фрейма, под свёрнутой кнопкой */}
      <Typography base="overline" tk="tk-22" className={styles.caption}>
        {copy.videoReview}
      </Typography>

      <div
        className={`${styles.frame} ${open ? styles.frameOpen : ''}`}
        onTransitionEnd={onFrameTransEnd}
      >
        {!open && (
          <button
            type="button"
            className={styles.trigger}
            onClick={openVideo}
            aria-label={copy.videoReview}
          >
            <span className={styles.playIcon} aria-hidden="true">
              ▶
            </span>
          </button>
        )}

        {mounted && (
          <iframe
            className={styles.video}
            src={src}
            title={copy.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        )}

        {/* крестик — только когда фрейм раскрыт ПОЛНОСТЬЮ; прячется сразу по клику */}
        {expanded && (
          <button
            type="button"
            className={styles.close}
            onClick={closeVideo}
            aria-label={copy.close}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
