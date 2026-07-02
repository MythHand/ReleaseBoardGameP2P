import { useRef, useState } from 'react'
import { play } from '@/animations'
import GameSettings from '@/blocks/GameSettings'
import LangSwitcher, { type SwitchLang } from '@/blocks/LangSwitcher'
import Menu, { MenuButton, MenuGroup } from '@/blocks/Menu'
import PhysicalEdition, {
  PHYSICAL_EDITION_COPY_EN,
  PHYSICAL_EDITION_COPY_RU,
} from '@/blocks/PhysicalEdition'
import Rules, { RULES_COPY_RU, type RulesCopy } from '@/blocks/Rules'
import VideoPlayer from '@/blocks/VideoPlayer'
import ReleaseLogo from '@/brand/ReleaseLogo'
import { DEFAULT_SETUP, type GameModesCopy, type Setup } from '@/game/modes'
import { randomNickname, sanitizeNickname } from '@/game/nicknames'
import DiceIcon from '@/icons/DiceIcon'
import Button from '@/primitives/Button'
import Input from '@/primitives/Input'
import Modal from '@/primitives/Modal'
import styles from './Start.module.css'

// внешние ссылки (открываются в новой вкладке)
const GITHUB_URL = 'https://github.com/MythHand'
const DESIGN_URL = 'https://github.com/dimbo-design'
const DEV_URL = 'https://github.com/ditayler'
// печатная версия — заказ/предзаказ ведём через Instagram команды
const INSTAGRAM_URL = 'https://www.instagram.com/mythhand.team/'
// game review — the embed shown in the start-screen video player
const VIDEO_URL = 'https://www.youtube.com/embed/bxGtRnoYW4g?autoplay=1'

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
  playground: string
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

interface StartProps {
  copy: StartCopy
  // текст правил по языку (модалка «Правила»)
  rulesCopy?: RulesCopy
  // точки подключения сетевой логики (создание/вход) — реализует консьюмер
  onCreate?: (nickname: string) => void
  onJoin?: (nickname: string, code: string) => void
  // переход в playground (на фронте ведёт на /playground/)
  onPlayground?: () => void
  // язык + смена: когда оба переданы — в правом верхнем углу рисуется свитчер.
  // Каталоги экран не держит (i18n-agnostic) — copy свапает консьюмер.
  lang?: SwitchLang
  onLangChange?: (lang: SwitchLang) => void
}

export default function Start({
  copy,
  onCreate,
  onJoin,
  onPlayground,
  rulesCopy = RULES_COPY_RU,
  lang,
  onLangChange,
}: StartProps) {
  const [modal, setModal] = useState<'create' | 'join' | 'rules' | null>(null)
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP)
  // никнейм нужен до создания/входа: лобби должно сразу показать игрока
  const [host, setHost] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const close = () => setModal(null)
  const setMode = (key: string, value: string) => setSetup((s) => ({ ...s, [key]: value }))

  // тряска незаполненных полей при попытке войти (play('shake') — тот же модуль,
  // что в экране приглашения): встряхиваем первое пустое поле
  const joinNameRef = useRef<HTMLDivElement>(null)
  const joinCodeRef = useRef<HTMLDivElement>(null)
  const joinValid = joinName.trim().length > 0 && joinCode.trim().length > 0
  const submitJoin = () => {
    if (joinValid) {
      onJoin?.(joinName, joinCode)
      close()
      return
    }
    // трясём все незаполненные поля
    if (!joinName.trim()) play('shake', joinNameRef.current)
    if (!joinCode.trim()) play('shake', joinCodeRef.current)
  }

  // создание лобби — та же реакция на заполненность, что у входа: пустой ник
  // даёт «выключенный» вид CTA и тряску поля вместо создания
  const hostRef = useRef<HTMLDivElement>(null)
  const createValid = host.trim().length > 0
  const submitCreate = () => {
    if (createValid) {
      onCreate?.(host)
      close()
      return
    }
    play('shake', hostRef.current)
  }

  return (
    <div className={styles.root}>
      <div className={styles.bg} />
      <div className={styles.blur} />
      <div className={styles.scrim} />

      {lang && onLangChange && (
        <>
          <div className={styles.langShade} />
          <div className={styles.langCorner}>
            <LangSwitcher value={lang} onChange={onLangChange} />
          </div>
        </>
      )}

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
          <Menu className={styles.menu}>
            <MenuGroup>
              <MenuButton onClick={() => setModal('create')}>{copy.createGame}</MenuButton>
              <MenuButton onClick={() => setModal('join')}>{copy.joinGame}</MenuButton>
            </MenuGroup>
            <MenuGroup>
              <MenuButton onClick={() => setModal('rules')}>{copy.rules}</MenuButton>
            </MenuGroup>
            <MenuGroup>
              <MenuButton onClick={() => window.open(GITHUB_URL, '_blank', 'noopener')}>
                {copy.github}
              </MenuButton>
              <MenuButton onClick={() => onPlayground?.()}>{copy.playground}</MenuButton>
            </MenuGroup>
          </Menu>
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

      {/* печатная версия — готовый блок @release/ui со своим копирайтом; правый
          нижний угол, симметрично авторству слева. Язык — по тому же сигналу, что
          у логотипа (logoVariant). Здесь только позиция/ширина через styles.physical */}
      <PhysicalEdition
        href={INSTAGRAM_URL}
        copy={copy.logoVariant === 'en' ? PHYSICAL_EDITION_COPY_EN : PHYSICAL_EDITION_COPY_RU}
        className={styles.physical}
      />

      {/* play button that expands in place into the video embed */}
      <VideoPlayer
        src={VIDEO_URL}
        copy={{ videoReview: copy.videoReview, close: copy.close, title: copy.logoAlt }}
      />

      <Modal open={modal === 'create'} onClose={close} title={copy.createTitle} wide>
        <div className={styles.createGrid}>
          <div className={styles.createMods}>
            <GameSettings setup={setup} onChange={setMode} copy={copy.modes} />
          </div>
          <div className={styles.createTech}>
            <h4 className={styles.techTitle}>{copy.lobbyParams}</h4>

            <div ref={hostRef}>
              <Input
                label={copy.nicknameLabel}
                value={host}
                onChange={(e) => setHost(sanitizeNickname(e.target.value))}
                placeholder={copy.nicknamePlaceholder}
                maxLength={20}
                plain
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
            </div>

            <Button className={createValid ? '' : styles.ctaIdle} onClick={submitCreate}>
              {copy.createCta}
            </Button>

            <p className={styles.note}>{copy.lobbyNote}</p>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'join'} onClose={close} title={copy.joinTitle}>
        <div ref={joinNameRef}>
          <Input
            label={copy.nicknameLabel}
            value={joinName}
            onChange={(e) => setJoinName(sanitizeNickname(e.target.value))}
            placeholder={copy.nicknamePlaceholder}
            maxLength={20}
            plain
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
        </div>
        <div ref={joinCodeRef}>
          <Input
            label={copy.gameCodeLabel}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder={copy.gameCodePlaceholder}
          />
        </div>
        <Button className={joinValid ? '' : styles.ctaIdle} onClick={submitJoin}>
          {copy.joinCta}
        </Button>
      </Modal>

      <Modal open={modal === 'rules'} onClose={close} title={copy.rulesTitle} wide>
        <Rules copy={rulesCopy} />
      </Modal>
    </div>
  )
}
