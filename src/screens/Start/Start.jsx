import { useEffect, useState } from 'react'
import Button from '@/primitives/Button'
import Modal from '@/primitives/Modal'
import styles from './Start.module.css'

const LOGO = '/assets/brand/release_logo.svg'

export default function Start() {
  const [modal, setModal] = useState(null) // 'create' | 'join' | null
  const [videoMounted, setVideoMounted] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const close = () => setModal(null)

  const openVideo = () => {
    setVideoMounted(true)
    requestAnimationFrame(() => setVideoOpen(true))
  }
  const closeVideo = () => setVideoOpen(false)
  // видео-плеер остаётся смонтированным до конца сворачивания — без перескоков
  const onPlayerTransEnd = (e) => {
    if (e.propertyName === 'width' && !videoOpen) setVideoMounted(false)
  }

  useEffect(() => {
    if (!videoOpen) return
    const onKey = (e) => e.key === 'Escape' && setVideoOpen(false)
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
          <img className={styles.logo} src={LOGO} alt="Release любой ценой" />
          <div className={styles.tags}>
            <span className={styles.tag}>Открытый P2P-проект</span>
            <span className={styles.tag}>Настольная карточная игра</span>
          </div>
          <p className={styles.desc}>
            Стратегическая карточная игра про реальные будни разработки. Баги, неожиданные
            события, атаки соперников — преодолевай всё это и зарелизь первым.
          </p>
          <div className={styles.actions}>
            <Button onClick={() => setModal('create')}>создать игру</Button>
            <Button onClick={() => setModal('join')}>подключиться</Button>
          </div>
        </div>
      </div>

      {/* play-кнопка, разворачивающаяся на месте в видео-плеер */}
      <div
        className={`${styles.player} ${videoOpen ? styles.playerOpen : ''}`}
        onTransitionEnd={onPlayerTransEnd}
      >
        <button
          className={styles.playFace}
          onClick={openVideo}
          aria-label="видео-обзор"
          tabIndex={videoMounted ? -1 : 0}
        >
          <span className={styles.playIcon}>▶</span>
          <span className={styles.playCap}>видео-обзор</span>
        </button>

        {videoMounted && (
          <div className={`${styles.videoFace} ${videoOpen ? styles.videoShown : ''}`}>
            <button className={styles.bigClose} onClick={closeVideo} aria-label="закрыть">
              ✕
            </button>
            <iframe
              className={styles.iframe}
              src="https://www.youtube.com/embed/bxGtRnoYW4g?autoplay=1"
              title="Release любой ценой — обзор"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
        )}
      </div>

      <Modal open={modal === 'create'} onClose={close} title="Создать игру">
        <p className={styles.stub}>
          Настройки партии — выбор режимов (лимит руки, Fast Release, условие релиза и т.д.).
          Скоро.
        </p>
        <Button onClick={close}>создать</Button>
      </Modal>

      <Modal open={modal === 'join'} onClose={close} title="Подключиться">
        <label className={styles.field}>
          <span className={styles.fieldLabel}>код игры</span>
          <input className={styles.input} placeholder="напр. 4F2A-9K" />
        </label>
        <Button onClick={close}>войти</Button>
      </Modal>
    </div>
  )
}
