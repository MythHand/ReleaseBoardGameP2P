import { useRef, useState } from 'react'
import { play } from '@/animations'
import LangSwitcher, { type SwitchLang } from '@/blocks/LangSwitcher'
import ReleaseLogo from '@/brand/ReleaseLogo'
import { randomNickname, sanitizeNickname } from '@/game/nicknames'
import DiceIcon from '@/icons/DiceIcon'
import Button from '@/primitives/Button'
import Input from '@/primitives/Input'
import styles from './Invite.module.css'

// Доступность слота в игре, на которую ведёт ссылка-приглашение:
//   open          — есть места и игрока, и зрителя
//   spectatorOnly — игрок занят, можно войти только зрителем
//   full          — свободных слотов нет вовсе, подключиться нельзя
//   notFound      — игры по коду нет (закрыта/неверная ссылка)
export type SlotAvailability = 'open' | 'spectatorOnly' | 'full' | 'notFound'
export type JoinRole = 'player' | 'spectator'

// Весь текст — пропсом (i18n-agnostic). Каталоги держит консьюмер.
export interface InviteCopy {
  logoAlt: string
  logoVariant?: 'ru' | 'en'
  tags: string[]
  description: string
  // заголовок формы приглашения (над полями)
  formTitle: string
  codeLabel: string
  nicknameLabel: string
  nicknamePlaceholder: string
  randomNick: string
  roleTitle: string
  rolePlayer: string
  roleSpectator: string
  spectatorOnlyNote: string
  fullTitle: string
  fullNote: string
  notFoundTitle: string
  notFoundNote: string
  refresh: string
  joinCta: string
  homePage: string
}

interface InviteProps {
  // код игры из ссылки-приглашения (/lobby/:code) — предзаполняет поле
  code: string
  availability: SlotAvailability
  copy: InviteCopy
  // подключение к игре — реализует консьюмер (сетевой слой)
  onJoin?: (nickname: string, code: string, role: JoinRole) => void
  // перепроверить доступность (для «мест нет» / «игра не найдена»);
  // кнопка обновления рисуется только когда колбэк передан — легко скрыть
  onRefresh?: () => void
  // уход на стартовый экран проекта
  onHome?: () => void
  // язык + смена: когда оба переданы — в правом верхнем углу рисуется свитчер
  lang?: SwitchLang
  onLangChange?: (lang: SwitchLang) => void
}

export default function Invite({
  code,
  availability,
  copy,
  onJoin,
  onRefresh,
  onHome,
  lang,
  onLangChange,
}: InviteProps) {
  const specOnly = availability === 'spectatorOnly'
  const isNotFound = availability === 'notFound'
  // и «мест нет», и «игра не найдена» — подключения нет, вместо формы сообщение
  const blocked = availability === 'full' || isNotFound

  const [nickname, setNickname] = useState('')
  const [codeValue, setCodeValue] = useState(code)
  const [role, setRole] = useState<JoinRole>(specOnly ? 'spectator' : 'player')
  // поля формы — цели тряски «поле не заполнено»
  const nickRef = useRef<HTMLDivElement>(null)
  const codeRef = useRef<HTMLDivElement>(null)

  // при spectatorOnly роль зафиксирована зрителем (кнопка игрока недоступна)
  const effectiveRole: JoinRole = specOnly ? 'spectator' : role
  const canJoin = nickname.trim().length > 0 && codeValue.trim().length > 0

  // кнопка выглядит выключенной, но кликабельна: трясём все незаполненные поля
  const handleJoin = () => {
    if (canJoin) {
      onJoin?.(nickname, codeValue, effectiveRole)
      return
    }
    if (!nickname.trim()) play('shake', nickRef.current)
    if (!codeValue.trim()) play('shake', codeRef.current)
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
          {/* область 1 — описание игры (как на стартовом экране) */}
          <section className={styles.about}>
            <ReleaseLogo className={styles.logo} variant={copy.logoVariant} />
            <div className={styles.tags}>
              {copy.tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
            <p className={styles.desc}>{copy.description}</p>
          </section>

          {/* область 2 — форма приглашения */}
          <section className={styles.form}>
            <h2 className={styles.formTitle}>{copy.formTitle}</h2>

            {blocked ? (
              <div className={styles.blocked}>
                <div className={styles.blockedTitle}>
                  {isNotFound ? copy.notFoundTitle : copy.fullTitle}
                </div>
                <p className={styles.blockedNote}>
                  {isNotFound ? copy.notFoundNote : copy.fullNote}
                </p>
                {onRefresh && (
                  <Button className={styles.refresh} variant="tech" onClick={onRefresh}>
                    {copy.refresh}
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* выбор роли — первым; в стиле полей ввода (лейбл + сегменты) */}
                <div className={styles.role}>
                  <span className={styles.roleLabel}>{copy.roleTitle}</span>
                  <div className={styles.roleOptions}>
                    <button
                      type="button"
                      disabled={specOnly}
                      className={`${styles.roleOpt} ${effectiveRole === 'player' ? styles.roleOptOn : ''}`}
                      onClick={() => setRole('player')}
                    >
                      {copy.rolePlayer}
                    </button>
                    <button
                      type="button"
                      className={`${styles.roleOpt} ${effectiveRole === 'spectator' ? styles.roleOptOn : ''}`}
                      onClick={() => setRole('spectator')}
                    >
                      {copy.roleSpectator}
                    </button>
                  </div>
                  {specOnly && <span className={styles.note}>{copy.spectatorOnlyNote}</span>}
                </div>

                <div ref={nickRef} className={styles.fieldWrap}>
                  <Input
                    label={copy.nicknameLabel}
                    value={nickname}
                    onChange={(e) => setNickname(sanitizeNickname(e.target.value))}
                    placeholder={copy.nicknamePlaceholder}
                    maxLength={20}
                    plain
                    trailing={
                      <Button
                        variant="icon"
                        onClick={() => setNickname(randomNickname())}
                        aria-label={copy.randomNick}
                        title={copy.randomNick}
                      >
                        <DiceIcon />
                      </Button>
                    }
                  />
                </div>
                <div ref={codeRef} className={styles.fieldWrap}>
                  <Input
                    label={copy.codeLabel}
                    value={codeValue}
                    onChange={(e) => setCodeValue(e.target.value)}
                  />
                </div>

                <div className={styles.joinRow}>
                  <Button className={canJoin ? '' : styles.joinIdle} onClick={handleJoin}>
                    {copy.joinCta}
                  </Button>
                </div>
              </>
            )}
          </section>

          {/* область 3 — уход на стартовый экран проекта (в скобках, по центру) */}
          <section className={styles.home}>
            <Button onClick={() => onHome?.()}>{copy.homePage}</Button>
          </section>
        </div>
      </div>
    </div>
  )
}
