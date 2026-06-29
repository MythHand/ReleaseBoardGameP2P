import { useRef, useState } from 'react'
import { play } from '@/animations'
import LangSwitcher, { type SwitchLang } from '@/blocks/LangSwitcher'
import ReleaseLogo from '@/brand/ReleaseLogo'
import { randomNickname, sanitizeNickname } from '@/game/nicknames'
import DiceIcon from '@/icons/DiceIcon'
import Button from '@/primitives/Button'
import Input from '@/primitives/Input'
import Spinner from '@/primitives/Spinner'
import styles from './Invite.module.css'

// Доступность слота по ссылке-приглашению — техническая ось «про форму»:
//   open          — есть места и игрока, и зрителя
//   spectatorOnly — игрок занят, войти можно только зрителем (жёлтая подпись)
//   full          — мест нет вовсе: обе роли недоступны, жёлтая «нет доступных
//                   мест», действие — «проверить слоты» (без красной строки)
export type SlotAvailability = 'open' | 'spectatorOnly' | 'full'
export type JoinRole = 'player' | 'spectator'

// Состояние экрана-приглашения — отдельная техническая ось от доступности слота:
//   form        — форма готова к вводу
//   connecting  — идёт подключение (спиннер + «отмена»)
//   connected   — подключились; консьюмер сейчас перебросит в лобби
//   failed      — подключение не удалось (красная строка + «повторить»)
//   full        — «мест нет» как результат: к жёлтой подписи добавляется красная
//   notFound    — игры по коду нет (красная строка)
export type InviteState = 'form' | 'connecting' | 'connected' | 'failed' | 'full' | 'notFound'

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
  // жёлтые подписи под выбором роли: только зритель / совсем нет мест
  spectatorOnlyNote: string
  noSlotsNote: string
  joinCta: string
  // ярлык действия, когда мест нет (перепроверка вместимости)
  checkSlots: string
  // статус-строки слота действия — единый паттерн «результат» (как ошибка):
  // подключение / успех / ошибка / мест нет / игра не найдена
  connecting: string
  connected: string
  cancel: string
  retry: string
  connectError: string
  fullStatus: string
  notFoundStatus: string
  homePage: string
}

interface InviteProps {
  // код игры из ссылки-приглашения (/lobby/:code) — предзаполняет поле
  code: string
  availability: SlotAvailability
  // состояние экрана; ведёт его консьюмер (сетевой слой). По умолчанию — форма
  state?: InviteState
  copy: InviteCopy
  // подключение к игре — реализует консьюмер (сетевой слой). Повтор после
  // ошибки — тот же колбэк (та же форма), отдельного onRetry не нужно
  onJoin?: (nickname: string, code: string, role: JoinRole) => void
  // отмена подключения (видна в состоянии connecting)
  onCancel?: () => void
  // уход на стартовый экран проекта
  onHome?: () => void
  // язык + смена: когда оба переданы — в правом верхнем углу рисуется свитчер
  lang?: SwitchLang
  onLangChange?: (lang: SwitchLang) => void
}

export default function Invite({
  code,
  availability,
  state = 'form',
  copy,
  onJoin,
  onCancel,
  onHome,
  lang,
  onLangChange,
}: InviteProps) {
  const specOnly = availability === 'spectatorOnly'
  // мест нет вовсе — обе роли недоступны, жёлтая «нет доступных мест», действие
  // «проверить слоты». Красная строка добавляется уже состоянием (state==='full')
  const noSlots = availability === 'full'
  // фазы подключения — состояния слота действия (форма всегда видна)
  const connecting = state === 'connecting'
  const connected = state === 'connected'
  const failed = state === 'failed'
  // во время подключения форма заблокирована (поля + выбор роли)
  const busy = connecting || connected
  // строка-статус в слоте действия (как у ошибки): ошибка / мест нет / не найдена
  const status = failed
    ? copy.connectError
    : state === 'full'
      ? copy.fullStatus
      : state === 'notFound'
        ? copy.notFoundStatus
        : null

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

            {/* поля ввода в контейнере фикс-высоты — высота учитывает жёлтую
                подпись: форма дышит внутри, а кнопки под контейнером не двигаются */}
            <div className={styles.fields}>
              {/* выбор роли — первым; в стиле полей ввода (лейбл + сегменты) */}
              <div className={styles.role}>
                <span className={styles.roleLabel}>{copy.roleTitle}</span>
                <div className={styles.roleOptions}>
                  <button
                    type="button"
                    disabled={specOnly || noSlots || busy}
                    className={`${styles.roleOpt} ${!noSlots && effectiveRole === 'player' ? styles.roleOptOn : ''}`}
                    onClick={() => setRole('player')}
                  >
                    {copy.rolePlayer}
                  </button>
                  <button
                    type="button"
                    disabled={noSlots || busy}
                    className={`${styles.roleOpt} ${!noSlots && effectiveRole === 'spectator' ? styles.roleOptOn : ''}`}
                    onClick={() => setRole('spectator')}
                  >
                    {copy.roleSpectator}
                  </button>
                </div>
                {(specOnly || noSlots) && (
                  <span className={styles.note}>
                    {noSlots ? copy.noSlotsNote : copy.spectatorOnlyNote}
                  </span>
                )}
              </div>

              <div ref={nickRef} className={styles.fieldWrap}>
                <Input
                  label={copy.nicknameLabel}
                  value={nickname}
                  onChange={(e) => setNickname(sanitizeNickname(e.target.value))}
                  placeholder={copy.nicknamePlaceholder}
                  maxLength={20}
                  plain
                  disabled={busy}
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
                  disabled={busy}
                />
              </div>
            </div>

            {/* слот действия — фикс. высоты; статус сверху, действие снизу. Единый
                паттерн результата: ошибка / мест нет / не найдена — строка + кнопка */}
            <div className={styles.action}>
              {status && <span className={styles.actionError}>{status}</span>}
              <div className={styles.actionRow}>
                {connecting ? (
                  <div className={styles.connecting}>
                    <span className={styles.connectingStatus}>
                      <Spinner size={16} />
                      {copy.connecting}
                    </span>
                    {onCancel && (
                      <Button variant="tech" onClick={onCancel}>
                        {copy.cancel}
                      </Button>
                    )}
                  </div>
                ) : connected ? (
                  <span className={styles.connected}>{copy.connected}</span>
                ) : (
                  // одна и та же кнопка (всегда handleJoin — ник обязателен и для
                  // проверки слотов); меняется лишь ярлык: проверить слоты / повторить
                  // / подключиться, и статус-строка сверху
                  <Button className={canJoin ? '' : styles.joinIdle} onClick={handleJoin}>
                    {noSlots ? copy.checkSlots : status ? copy.retry : copy.joinCta}
                  </Button>
                )}
              </div>
            </div>
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
