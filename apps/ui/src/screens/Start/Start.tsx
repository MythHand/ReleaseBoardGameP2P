import type { TransitionEvent } from 'react'
import { useEffect, useState } from 'react'
import ReleaseLogo from '@/brand/ReleaseLogo'
import { buildModes, DEFAULT_SETUP, type ModesCopy, type Setup } from '@/game/modes'
import Button from '@/primitives/Button'
import Modal from '@/primitives/Modal'
import ModeSelect from '@/primitives/ModeSelect'
import MYTHHAND from '../../assets/brand/mythhand.svg'
import Rules from './Rules'
import styles from './Start.module.css'

const REPO_URL = 'https://github.com/dimbo-design/ReleaseBoardGameP2P'

export interface StartCopy {
  logoAlt: string
  tags: string[]
  description: string
  createGame: string
  joinGame: string
  rules: string
  github: string
  videoReview: string
  close: string
  createTitle: string
  lobbyParams: string
  nicknameLabel: string
  nicknamePlaceholder: string
  createCta: string
  lobbyNote: string
  joinTitle: string
  gameCodeLabel: string
  gameCodePlaceholder: string
  joinCta: string
  rulesTitle: string
  modes: ModesCopy
}

export default function Start({ copy }: { copy: StartCopy }) {
  const [modal, setModal] = useState<'create' | 'join' | 'rules' | null>(null)
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP)
  const modes = buildModes(copy.modes)
  // никнейм нужен до создания/входа: лобби должно сразу показать игрока
  const [host, setHost] = useState('')
  const [joinName, setJoinName] = useState('')
  const [videoMounted, setVideoMounted] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const close = () => setModal(null)
  const setMode = (key: string, value: string) => setSetup((s) => ({ ...s, [key]: value }))

  const openVideo = () => {
    setVideoMounted(true)
    requestAnimationFrame(() => setVideoOpen(true))
  }
  const closeVideo = () => setVideoOpen(false)
  // видео-плеер остаётся смонтированным до конца сворачивания — без перескоков
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
    <div className={styles.root}>
      <div className={styles.bg} />
      <div className={styles.blur} />
      <div className={styles.scrim} />

      <div className={styles.content}>
        <div className={styles.col}>
          <ReleaseLogo className={styles.logo} />
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
          <div className={`${styles.actions} ${styles.actionsSecondary}`}>
            <Button onClick={() => setModal('rules')}>{copy.rules}</Button>
            <Button onClick={() => window.open(REPO_URL, '_blank', 'noopener')}>
              {copy.github}
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

      <Modal open={modal === 'create'} onClose={close} title={copy.createTitle} wide>
        <div className={styles.createGrid}>
          <div className={styles.createMods}>
            {modes.map((m) => (
              <ModeSelect
                key={m.key}
                title={m.title}
                options={m.options}
                value={setup[m.key] ?? ''}
                onChange={(v) => setMode(m.key, v)}
              />
            ))}
          </div>
          <div className={styles.createTech}>
            <h4 className={styles.techTitle}>{copy.lobbyParams}</h4>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>{copy.nicknameLabel}</span>
              <input
                className={styles.input}
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder={copy.nicknamePlaceholder}
                maxLength={20}
              />
            </label>

            <Button onClick={close}>{copy.createCta}</Button>

            <p className={styles.note}>{copy.lobbyNote}</p>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'join'} onClose={close} title={copy.joinTitle}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{copy.nicknameLabel}</span>
          <input
            className={styles.input}
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder={copy.nicknamePlaceholder}
            maxLength={20}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{copy.gameCodeLabel}</span>
          <input className={styles.input} placeholder={copy.gameCodePlaceholder} />
        </label>
        <Button onClick={close}>{copy.joinCta}</Button>
      </Modal>

      <Modal open={modal === 'rules'} onClose={close} title={copy.rulesTitle}>
        <Rules />
      </Modal>
    </div>
  )
}
