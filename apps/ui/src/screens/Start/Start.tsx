import Button from '@/primitives/Button'
import Modal from '@/primitives/Modal'
import type { TransitionEvent } from 'react'
import { useEffect, useState } from 'react'
import LOGO from '../../assets/brand/release_logo.svg'
import styles from './Start.module.css'

export interface StartCopy {
  logoAlt: string
  tags: string[]
  description: string
  createGame: string
  joinGame: string
  videoReview: string
  close: string
  createTitle: string
  createStub: string
  createCta: string
  joinTitle: string
  gameCodeLabel: string
  gameCodePlaceholder: string
  joinCta: string
}

export default function Start({ copy }: { copy: StartCopy }) {
  const [modal, setModal] = useState<'create' | 'join' | null>(null)
  const [videoMounted, setVideoMounted] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const close = () => setModal(null)

  const openVideo = () => {
    setVideoMounted(true)
    requestAnimationFrame(() => setVideoOpen(true))
  }
  const closeVideo = () => setVideoOpen(false)
  // видео-плеер остаётся смонтированным до конца сворачивания — без перескоков
  const onPlayerTransEnd = (e: TransitionEvent) => {
    if (e.propertyName === 'width' && !videoOpen) setVideoMounted(false)
  }

  useEffect(() => {
    if (!videoOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setVideoOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [videoOpen])

  return (
    <div className={styles.root}>
      <div className={styles.bg} />
      <div className={styles.blur} />
      <div className={styles.scrim} />

      <div className={styles.content}>
        <div className={styles.col}>
          <img className={styles.logo} src={LOGO} alt={copy.logoAlt} />
          <div className={styles.tags}>
            {copy.tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
          </div>
          <p className={styles.desc}>{copy.description}</p>
          <div className={styles.actions}>
            <Button onClick={() => setModal('create')}>{copy.createGame}</Button>
            <Button onClick={() => setModal('join')}>{copy.joinGame}</Button>
          </div>
        </div>
      </div>

      {/* play-кнопка, разворачивающаяся на месте в видео-плеер */}
      <div
        className={`${styles.player} ${videoOpen ? styles.playerOpen : ''}`}
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
          <span className={styles.playCap}>{copy.videoReview}</span>
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
              src="https://www.youtube.com/embed/bxGtRnoYW4g?autoplay=1"
              title={copy.logoAlt}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
        )}
      </div>

      <Modal open={modal === 'create'} onClose={close} title={copy.createTitle}>
        <p className={styles.stub}>{copy.createStub}</p>
        <Button onClick={close}>{copy.createCta}</Button>
      </Modal>

      <Modal open={modal === 'join'} onClose={close} title={copy.joinTitle}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{copy.gameCodeLabel}</span>
          <input className={styles.input} placeholder={copy.gameCodePlaceholder} />
        </label>
        <Button onClick={close}>{copy.joinCta}</Button>
      </Modal>
    </div>
  )
}
