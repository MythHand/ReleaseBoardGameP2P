import type { TransitionEvent } from 'react'
import { useEffect, useState } from 'react'
import GameSettings from '@/blocks/GameSettings'
import ReleaseLogo from '@/brand/ReleaseLogo'
import { DEFAULT_SETUP, type GameModesCopy, type Setup } from '@/game/modes'
import { randomNickname, sanitizeNickname } from '@/game/nicknames'
import DiceIcon from '@/icons/DiceIcon'
import Button from '@/primitives/Button'
import Input from '@/primitives/Input'
import Modal from '@/primitives/Modal'
import Rules from './Rules'
import styles from './Start.module.css'

// внешние ссылки (открываются в новой вкладке)
const GITHUB_URL = 'https://github.com/MythHand'
const DESIGN_URL = 'https://github.com/dimbo-design'
const DEV_URL = 'https://github.com/ditayler'

// авторы — собственные имена, одинаковы для всех языков
const DESIGN_NAME = 'Togulev Dmitry'
const DEV_NAME = 'Andrey Konnov'

export interface StartCopy {
  logoAlt: string
  // вариант начертания логотипа под язык интерфейса
  logoVariant?: 'ru' | 'en'
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
  randomNick: string
  createCta: string
  lobbyNote: string
  joinTitle: string
  gameCodeLabel: string
  gameCodePlaceholder: string
  joinCta: string
  rulesTitle: string
  // подписи авторства в левом нижнем углу
  authorDesign: string
  authorDev: string
  // текст режимов партии (заголовки + описания опций)
  modes: GameModesCopy
}

export default function Start({ copy }: { copy: StartCopy }) {
  const [modal, setModal] = useState<'create' | 'join' | 'rules' | null>(null)
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP)
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
          <ReleaseLogo className={styles.logo} variant={copy.logoVariant} />
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
            <Button onClick={() => window.open(GITHUB_URL, '_blank', 'noopener')}>
              {copy.github}
            </Button>
          </div>
        </div>
      </div>

      {/* авторство — левый нижний угол экрана; имена ведут на профили GitHub */}
      <div className={styles.credits}>
        <span className={styles.credit}>
          <span className={styles.creditLabel}>{copy.authorDesign}</span>
          <a
            className={styles.creditLink}
            href={DESIGN_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {DESIGN_NAME}
          </a>
        </span>
        <span className={styles.credit}>
          <span className={styles.creditLabel}>{copy.authorDev}</span>
          <a className={styles.creditLink} href={DEV_URL} target="_blank" rel="noopener noreferrer">
            {DEV_NAME}
          </a>
        </span>
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
            <GameSettings setup={setup} onChange={setMode} copy={copy.modes} />
          </div>
          <div className={styles.createTech}>
            <h4 className={styles.techTitle}>{copy.lobbyParams}</h4>

            <Input
              label={copy.nicknameLabel}
              value={host}
              onChange={(e) => setHost(sanitizeNickname(e.target.value))}
              placeholder={copy.nicknamePlaceholder}
              maxLength={20}
              trailing={
                <Button
                  variant="icon"
                  onClick={() => setHost(randomNickname())}
                  aria-label={copy.randomNick}
                  title={copy.randomNick}
                >
                  <DiceIcon />
                </Button>
              }
            />

            <Button onClick={close}>{copy.createCta}</Button>

            <p className={styles.note}>{copy.lobbyNote}</p>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'join'} onClose={close} title={copy.joinTitle}>
        <Input
          label={copy.nicknameLabel}
          value={joinName}
          onChange={(e) => setJoinName(sanitizeNickname(e.target.value))}
          placeholder={copy.nicknamePlaceholder}
          maxLength={20}
          trailing={
            <Button
              variant="icon"
              onClick={() => setJoinName(randomNickname())}
              aria-label={copy.randomNick}
              title={copy.randomNick}
            >
              <DiceIcon />
            </Button>
          }
        />
        <Input label={copy.gameCodeLabel} placeholder={copy.gameCodePlaceholder} />
        <Button onClick={close}>{copy.joinCta}</Button>
      </Modal>

      <Modal open={modal === 'rules'} onClose={close} title={copy.rulesTitle}>
        <Rules />
      </Modal>
    </div>
  )
}
