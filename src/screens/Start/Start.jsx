import { useEffect, useState } from 'react'
import Button from '@/primitives/Button'
import Modal from '@/primitives/Modal'
import ReleaseLogo from '@/brand/ReleaseLogo'
import ModeSelect from '@/primitives/ModeSelect'
import { GAME_MODES, DEFAULT_SETUP } from '@/game/modes'
import Rules from './Rules'
import styles from './Start.module.css'

const MYTHHAND = '/assets/brand/mythhand.svg'
const REPO_URL = 'https://github.com/dimbo-design/ReleaseBoardGameP2P'

export default function Start() {
  const [modal, setModal] = useState(null) // 'create' | 'join' | 'rules' | null
  const [setup, setSetup] = useState(DEFAULT_SETUP)
  // никнейм нужен до создания/входа: лобби должно сразу показать игрока
  const [host, setHost] = useState('')
  const [joinName, setJoinName] = useState('')
  const [videoMounted, setVideoMounted] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const close = () => setModal(null)
  const setMode = (key, value) => setSetup((s) => ({ ...s, [key]: value }))

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
          <ReleaseLogo className={styles.logo} />
          <div className={styles.tags}>
            <span className={styles.tag}>Открытый P2P-проект</span>
            <span className={styles.tag}>По настольной карточной игре</span>
          </div>
          <p className={styles.desc}>
            Стратегическая карточная игра про реальные будни разработки. Баги, неожиданные
            события, атаки соперников — преодолевай всё это и зарелизь первым.
          </p>
          <div className={styles.actions}>
            <Button onClick={() => setModal('create')}>создать игру</Button>
            <Button onClick={() => setModal('join')}>подключиться</Button>
          </div>
          <div className={`${styles.actions} ${styles.actionsSecondary}`}>
            <Button onClick={() => setModal('rules')}>правила</Button>
            <Button onClick={() => window.open(REPO_URL, '_blank', 'noopener')}>
              GitHub
            </Button>
          </div>
          <img className={styles.brandMark} src={MYTHHAND} alt="MythHand" />
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

      <Modal open={modal === 'create'} onClose={close} title="Создать игру" wide>
        <div className={styles.createGrid}>
          <div className={styles.createMods}>
            {GAME_MODES.map((m) => (
              <ModeSelect
                key={m.key}
                title={m.title}
                options={m.options}
                value={setup[m.key]}
                onChange={(v) => setMode(m.key, v)}
              />
            ))}
          </div>
          <div className={styles.createTech}>
            <h4 className={styles.techTitle}>Параметры лобби</h4>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Ваш никнейм</span>
              <input
                className={styles.input}
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="напр. dimbo"
                maxLength={20}
              />
            </label>

            <Button onClick={close}>создать лобби</Button>

            <p className={styles.note}>
              Лимит игроков и режимы партии настраиваются уже в лобби — пересоздавать
              ничего не нужно.
            </p>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'join'} onClose={close} title="Подключиться">
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Ваш никнейм</span>
          <input
            className={styles.input}
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="напр. dimbo"
            maxLength={20}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>код игры</span>
          <input className={styles.input} placeholder="напр. 4F2A-9K" />
        </label>
        <Button onClick={close}>войти</Button>
      </Modal>

      <Modal open={modal === 'rules'} onClose={close} title="Правила">
        <Rules />
      </Modal>
    </div>
  )
}
