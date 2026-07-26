import {
  Fragment,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { SwitchLang } from '@/blocks/LangSwitcher'
import { CARD_CONTENT, CARDS } from '@/cards'
import CardParallax, {
  type CardParallaxContent,
  PARALLAX_CARDS,
  type ParallaxCardConfig,
} from '@/cards/CardParallax'
import styles from './Rules.module.css'

// Правила = скелет (структура, язык-независимая) + copy (тексты по id, на язык).
// Имена карт в скелете общие для всех языков (они же ключи арта в каталоге).
// Тексты — в центральном каталоге (`common.json` → `rulesBlock`); консьюмер
// передаёт их пропсом, библиотека остаётся i18n-agnostic.

// ── собранная форма (то, что рендерит компонент) ──────────────────────────
export interface RuleCard {
  names: string[]
  desc?: string
  lead?: string
  body?: string[]
  outro?: string
}

export interface RuleGroup {
  title?: string
  lead?: string
  body?: string[]
  cards?: RuleCard[]
  table?: boolean
  outro?: string
}

export interface RulesSection {
  title: string
  groupStart?: boolean
  lead?: string
  body?: string[]
  groups?: RuleGroup[]
  outro?: string
}

// ── скелет (без текста) ───────────────────────────────────────────────────
interface CardSkel {
  id: string
  names: string[]
}
interface GroupSkel {
  id: string
  table?: boolean
  cards?: CardSkel[]
}
interface SectionSkel {
  id: string
  groupStart?: boolean
  groups?: GroupSkel[]
}

const RULES: SectionSkel[] = [
  { id: 'objective' },
  { id: 'setup' },
  {
    id: 'turn',
    groups: [{ id: 'turn.play' }, { id: 'turn.draw' }, { id: 'turn.end' }],
  },
  { id: 'end' },
  {
    id: 'mechanics',
    groups: [
      { id: 'mech.release' },
      { id: 'mech.attack' },
      { id: 'mech.trigger' },
      { id: 'mech.events' },
    ],
  },
  {
    id: 'cards',
    groupStart: true,
    groups: [
      {
        id: 'cards.release',
        cards: [{ id: 'c.release', names: ['Frontend', 'Backend', 'Database'] }],
      },
      {
        id: 'cards.defense',
        cards: [
          { id: 'c.debugger', names: ['Debugger'] },
          { id: 'c.monitoring', names: ['Monitoring'] },
          { id: 'c.aimon', names: ['AI Monitoring'] },
        ],
      },
      {
        id: 'cards.attack',
        cards: [
          { id: 'c.bug', names: ['Bug', 'Out of Memory', 'Legacy Code'] },
          { id: 'c.secbug', names: ['Security Bug'] },
          { id: 'c.ddos', names: ['DDoS'] },
        ],
      },
      {
        id: 'cards.cancel',
        cards: [
          { id: 'c.hotfix', names: ['Hotfix', 'Rubber Ducky', 'PR Approved'] },
          { id: 'c.rollback', names: ['Rollback'] },
          { id: 'c.notabug', names: ['Not a Bug'] },
          { id: 'c.wom', names: ['Works on my Machine'] },
        ],
      },
      {
        id: 'cards.support',
        cards: [
          { id: 'c.sudo', names: ['Sudo'] },
          { id: 'c.codereview', names: ['Code Review'] },
        ],
      },
      {
        id: 'cards.git',
        cards: [
          { id: 'c.gitbranch', names: ['Git Branch'] },
          { id: 'c.gitmerge', names: ['Git Merge'] },
          { id: 'c.gitrebase', names: ['Git Rebase'] },
          { id: 'c.gitcherry', names: ['Git Cherry-pick'] },
          { id: 'c.sysupgrade', names: ['System Upgrade'] },
        ],
      },
      {
        id: 'cards.trigger',
        cards: [
          { id: 'c.error503', names: ['Error 503'] },
          { id: 'c.ai', names: ['AI'] },
        ],
      },
      {
        id: 'cards.ai',
        cards: [
          { id: 'ai.mon', names: ['AI Monitoring'] },
          { id: 'ai.crush', names: ['Crush Frontend', 'Crush Backend', 'Crush Database'] },
          { id: 'ai.release', names: ['Release Frontend', 'Release Backend', 'Release Database'] },
          { id: 'ai.inside', names: ['Inside'] },
          { id: 'ai.goodvibe', names: ['Good Vibe-Coding'] },
          { id: 'ai.badvibe', names: ['Bad Vibe-Coding'] },
          { id: 'ai.hallucination', names: ['Hallucination'] },
          { id: 'ai.error503', names: ['Error 503'] },
        ],
      },
    ],
  },
  {
    id: 'modes',
    groupStart: true,
    groups: [
      {
        id: 'mode.hand',
        table: true,
        cards: [
          { id: 'mode.hand.base', names: ['Base'] },
          { id: 'mode.hand.8bit', names: ['8 bit'] },
          { id: 'mode.hand.mem', names: ['Memory Problem'] },
        ],
      },
      {
        id: 'mode.rel',
        table: true,
        cards: [
          { id: 'mode.rel.base', names: ['Base'] },
          { id: 'mode.rel.fast', names: ['Fast Release'] },
        ],
      },
      {
        id: 'mode.cond',
        table: true,
        cards: [
          { id: 'mode.cond.base', names: ['Base'] },
          { id: 'mode.cond.easy', names: ['Easy Release'] },
        ],
      },
      {
        id: 'mode.ai',
        table: true,
        cards: [
          { id: 'mode.ai.base', names: ['Base'] },
          { id: 'mode.ai.less', names: ['Less AI Random'] },
          { id: 'mode.ai.no', names: ['No AI'] },
        ],
      },
      {
        id: 'mode.git',
        table: true,
        cards: [
          { id: 'mode.git.base', names: ['Base'] },
          { id: 'mode.git.strat', names: ['Strategic'] },
        ],
      },
    ],
  },
]

// ── тексты по id (на язык) ────────────────────────────────────────────────
interface RuleText {
  title?: string
  lead?: string
  body?: string[]
  desc?: string
  outro?: string
}

export interface RulesCopy {
  meta: string[]
  searchPlaceholder: string
  notFound: string
  text: Record<string, RuleText>
}

// Скелет + copy → собранные секции для рендера.
function buildSections(skel: SectionSkel[], copy: RulesCopy): RulesSection[] {
  const t = (id: string): RuleText => copy.text[id] ?? {}
  return skel.map((s) => {
    const st = t(s.id)
    return {
      title: st.title ?? '',
      groupStart: s.groupStart,
      lead: st.lead,
      body: st.body,
      outro: st.outro,
      groups: s.groups?.map((g) => {
        const gt = t(g.id)
        return {
          title: gt.title,
          table: g.table,
          lead: gt.lead,
          body: gt.body,
          outro: gt.outro,
          cards: g.cards?.map((c) => {
            const ct = t(c.id)
            return { names: c.names, desc: ct.desc, lead: ct.lead, body: ct.body, outro: ct.outro }
          }),
        }
      }),
    }
  })
}

export interface RulesProps {
  // текст правил (из каталога `rulesBlock`, по языку) — передаёт консьюмер
  copy: RulesCopy
  // language for the composed card faces shown in the card reference
  lang?: SwitchLang
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Фильтрация по смысловым блокам (сужение): совпавшая секция показывается
// целиком, иначе сворачивается до совпавших подразделов и карт.
const inc = (hay: string, q: string) => hay.toLowerCase().includes(q)
const cardHay = (c: RuleCard) =>
  [...c.names, c.desc, c.lead, c.outro, ...(c.body ?? [])].filter(Boolean).join(' ')
const groupHay = (g: RuleGroup) => [g.title, g.lead, g.outro, ...(g.body ?? [])].join(' ')
const sectionHay = (s: RulesSection) => [s.title, s.lead, s.outro, ...(s.body ?? [])].join(' ')

// Имена карт — выделяются жирным, когда встречаются в тексте правил.
// Длинные имена идут первыми при матчинге (Security Bug раньше Bug,
// AI Monitoring раньше AI) — для этого сортируем по длине при сборке регэкспа.
const CARD_TERMS = [
  'AI Monitoring',
  'Crush Frontend',
  'Crush Backend',
  'Crush Database',
  'Release Frontend',
  'Release Backend',
  'Release Database',
  'Out of Memory',
  'Legacy Code',
  'Security Bug',
  'Code Review',
  'Rubber Ducky',
  'PR Approved',
  'Not a Bug',
  'Works on my Machine',
  'Git Branch',
  'Git Merge',
  'Git Rebase',
  'Git Cherry-pick',
  'System Upgrade',
  'Good Vibe-Coding',
  'Bad Vibe-Coding',
  'Memory Problem',
  'Fast Release',
  'Easy Release',
  'Less AI Random',
  'Error 503',
  '8 bit',
  'No AI',
  'Frontend',
  'Backend',
  'Database',
  'Debugger',
  'Monitoring',
  'Hotfix',
  'Rollback',
  'Hallucination',
  'Inside',
  'DDoS',
  'Sudo',
  'Release',
  'Crush',
  'Cancel',
  'Unicorn',
  'Bug',
  'Strategic',
  'Base',
  'AI',
]
const TERM_RE = new RegExp(
  `(${[...CARD_TERMS]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})`,
)

// Текст с именами карт, обёрнутыми в <b> (жирный — см. .rules b). split по
// захватывающей группе чередует обычный текст и совпадения: нечётные — имена.
const rich = (text: string): ReactNode =>
  text.split(TERM_RE).map((part, i) =>
    i % 2 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: позиционные фрагменты split — порядок стабилен
      <b key={i}>{part}</b>
    ) : (
      part
    ),
  )

// Карта по имени — из каталога CARDS (единый источник; первое совпадение).
type CatalogCard = (typeof CARDS)[number]
const CARD_BY_NAME = new Map<string, CatalogCard>()
for (const c of CARDS) if (!CARD_BY_NAME.has(c.name)) CARD_BY_NAME.set(c.name, c)

// Карты для имён записи: имена без карты в каталоге (режимы) отсеиваются.
const cardsFor = (names: string[]) =>
  names.map((name) => CARD_BY_NAME.get(name)).filter((c): c is CatalogCard => Boolean(c))

// display width of a card face in the reference (px); a hover lifts a ×2 copy
// into a top-layer portal (below) so it escapes the modal's overflow clipping.
const REF_CARD_W = 98

interface ZoomCard {
  id: string
  rect: DOMRect
  config: ParallaxCardConfig
  content: CardParallaxContent
}

// Hover-zoom overlay — an enlarged, parallax card portaled to <body> and fixed at
// the reference slot, so no ancestor's overflow (the Rules modal scrolls) can clip
// it. Grows ×2 from the slot centre on mount, shrinks back before unmounting.
function CardZoomOverlay({ card, onClose }: { card: ZoomCard; onClose: () => void }) {
  const [grown, setGrown] = useState(false)
  const closing = useRef(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const { rect } = card
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: decorative hover-zoom overlay; mouse only
    <div
      className={styles.zoomOverlay}
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        transform: `scale(${grown ? 2 : 1})`,
      }}
      onMouseLeave={() => {
        closing.current = true
        setGrown(false)
      }}
      onTransitionEnd={(e) => {
        if (closing.current && e.propertyName === 'transform') onClose()
      }}
    >
      <CardParallax config={card.config} content={card.content} width={rect.width} interactive />
    </div>,
    document.body,
  )
}

// Усиленный (sudo) эффект в описании карты: выносим на новую строку, жёлтым
// подсвечиваем только метку «sudo + имя карты» (mark), текст эффекта (rest) —
// обычный. Двоеточие отделяет метку и отсеивает «sudo-атаки» / «эффект sudo».
const splitSudo = (desc: string) => {
  const m = desc.match(/^(.*?)\s+(sudo\b[^:]*)(:.*)$/is)
  return m ? { main: m[1], mark: m[2], rest: m[3] } : null
}

// Presentational + i18n-agnostic: текст приходит через copy от консьюмера.
//
// Поиск повторяет браузерный «найти на странице»: текст не фильтруется, все
// совпадения подсвечиваются и нумеруются (data-mi в DOM-порядке), активное
// выделяется ярче; стрелки / Enter переключают активное и скроллят к нему.
export default function Rules({ copy, lang = 'ru' }: RulesProps) {
  const sections = useMemo(() => buildSections(RULES, copy), [copy])
  // hovered card lifted into the top-layer zoom overlay (null = none)
  const [zoom, setZoom] = useState<ZoomCard | null>(null)
  const meta = copy.meta
  const searchPlaceholder = copy.searchPlaceholder
  const notFoundText = copy.notFound

  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [count, setCount] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const query = q.trim()
  const ql = query.toLowerCase()

  // Сужение: совпавшая секция целиком, иначе — только совпавшие подразделы/карты.
  const groupView = (g: RuleGroup): RuleGroup | null => {
    if (inc(groupHay(g), ql)) return g
    const cards = (g.cards ?? []).filter((c) => inc(cardHay(c), ql))
    return cards.length > 0 ? { ...g, cards } : null
  }
  const sectionView = (s: RulesSection): RulesSection | null => {
    if (!query) return s
    if (inc(sectionHay(s), ql)) return s
    const groups = (s.groups ?? []).map(groupView).filter((g): g is RuleGroup => g !== null)
    return groups.length > 0 ? { ...s, groups } : null
  }
  const shown = sections.map(sectionView).filter((s): s is RulesSection => s !== null)

  // Захватывающая группа — чтобы split чередовал обычный текст и совпадения.
  const queryRe = query ? new RegExp(`(${escapeRe(query)})`, 'ig') : null

  // Счётчик совпадений обнуляется каждый рендер: marker() присваивает каждому
  // совпадению data-mi в DOM-порядке (он же — порядок навигации).
  const counter = { n: 0 }
  const marker = (text: string, withTerms: boolean): ReactNode => {
    if (!queryRe) return withTerms ? rich(text) : text
    return text.split(queryRe).map((part, i) => {
      if (!part) return null
      if (i % 2 === 1) {
        const mi = counter.n++
        return (
          <mark
            key={`m${mi}`}
            data-mi={mi}
            className={mi === active ? styles.markActive : styles.mark}
          >
            {part}
          </mark>
        )
      }
      // biome-ignore lint/suspicious/noArrayIndexKey: позиционные фрагменты split — порядок стабилен
      return <Fragment key={i}>{withTerms ? rich(part) : part}</Fragment>
    })
  }
  const hl = (text: string) => marker(text, false) // заголовки/имена — без жирных имён карт
  const txt = (text: string) => marker(text, true) // проза — с жирными именами карт

  // Пересчёт совпадений после рендера: зависит от запроса (меняется набор
  // отрисованных совпадений), хотя query и не используется в теле напрямую.
  // biome-ignore lint/correctness/useExhaustiveDependencies: query управляет числом совпадений в DOM
  useLayoutEffect(() => {
    setCount(boxRef.current?.querySelectorAll('[data-mi]').length ?? 0)
  }, [query])

  // Скролл к активному совпадению.
  useEffect(() => {
    if (count === 0) return
    boxRef.current
      ?.querySelector(`[data-mi="${active}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active, count])

  const go = (dir: 1 | -1) => {
    if (count > 0) setActive((a) => (a + dir + count) % count)
  }
  const onSearch = (v: string) => {
    setQ(v)
    setActive(0)
  }

  const renderBody = (body?: string[]) => {
    if (!body || body.length === 0) return null
    if (body.length === 1) return <p className={styles.para}>{txt(body[0])}</p>
    return (
      <ul className={styles.list}>
        {body.map((line) => (
          <li key={line}>{txt(line)}</li>
        ))}
      </ul>
    )
  }

  const renderCards = (cards?: RuleCard[]) =>
    cards?.map((c) => {
      const faces = cardsFor(c.names)
      const sudo = c.desc ? splitSudo(c.desc) : null
      return (
        <div key={c.names.join('/')} className={styles.card}>
          {faces.length > 0 && (
            <div className={styles.cardArt}>
              {faces.map((card) => {
                const config = PARALLAX_CARDS[card.id]
                const cc = CARD_CONTENT[card.id]?.[lang]
                if (!config || !cc) {
                  return (
                    <img
                      key={card.id}
                      className={styles.cardThumb}
                      src={card.art}
                      alt={card.name}
                    />
                  )
                }
                const content: CardParallaxContent = {
                  title: cc.title,
                  description: cc.paragraphs,
                }
                return (
                  // biome-ignore lint/a11y/noStaticElementInteractions: hover spawns the decorative zoom overlay; mouse only
                  <div
                    key={card.id}
                    className={styles.cardZoom}
                    onMouseEnter={(e) =>
                      setZoom({
                        id: card.id,
                        rect: e.currentTarget.getBoundingClientRect(),
                        config,
                        content,
                      })
                    }
                  >
                    <CardParallax
                      config={config}
                      content={content}
                      width={REF_CARD_W}
                      interactive={false}
                    />
                  </div>
                )
              })}
            </div>
          )}
          <div className={styles.cardText}>
            <p className={styles.cardName}>{hl(c.names.join(' · '))}</p>
            {c.lead && <p className={styles.cardDesc}>{txt(c.lead)}</p>}
            {c.desc && <p className={styles.cardDesc}>{txt(sudo ? sudo.main : c.desc)}</p>}
            {sudo && (
              <p className={styles.sudoLine}>
                <span className={styles.sudoMark}>{hl(sudo.mark)}</span>
                {txt(sudo.rest)}
              </p>
            )}
            {c.body && (
              <ul className={styles.cardList}>
                {c.body.map((line) => (
                  <li key={line}>{txt(line)}</li>
                ))}
              </ul>
            )}
            {c.outro && <p className={styles.cardOutro}>{txt(c.outro)}</p>}
          </div>
        </div>
      )
    })

  // Игровые режимы — таблица «опция → эффект».
  const renderModeTable = (cards?: RuleCard[]) =>
    cards && (
      <div className={styles.modeTable}>
        {cards.map((c) => (
          <Fragment key={c.names.join('/')}>
            <div className={styles.modeName}>{hl(c.names.join(' · '))}</div>
            <div className={styles.modeVal}>{txt(c.desc ?? '')}</div>
          </Fragment>
        ))}
      </div>
    )

  return (
    <div ref={boxRef} className={styles.rules}>
      <div className={styles.searchBar}>
        <input
          className={styles.search}
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go(e.shiftKey ? -1 : 1)
            else if (e.key === 'ArrowDown') {
              e.preventDefault()
              go(1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              go(-1)
            } else if (e.key === 'Escape') onSearch('')
          }}
          placeholder={searchPlaceholder}
        />
        {query && (
          <div className={styles.searchTools}>
            <span className={styles.count}>{count ? `${active + 1}/${count}` : '0/0'}</span>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => go(-1)}
              disabled={!count}
              aria-label="предыдущее совпадение"
            >
              ↑
            </button>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => go(1)}
              disabled={!count}
              aria-label="следующее совпадение"
            >
              ↓
            </button>
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => onSearch('')}
              aria-label="очистить поиск"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {!query && (
        <ul className={styles.meta}>
          {meta.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {shown.map((s) => (
        <section
          key={s.title}
          className={s.groupStart ? `${styles.sec} ${styles.secGap}` : styles.sec}
        >
          <h4 className={styles.h}>{hl(s.title)}</h4>
          {s.lead && <p className={styles.para}>{txt(s.lead)}</p>}
          {renderBody(s.body)}

          {s.groups?.map((g) => (
            <div key={g.title ?? g.cards?.[0]?.names.join('/')} className={styles.group}>
              <div className={styles.groupBody}>
                {g.title && <h5 className={styles.sub}>{hl(g.title)}</h5>}
                {g.lead && <p className={styles.para}>{txt(g.lead)}</p>}
                {renderBody(g.body)}
                {g.table ? renderModeTable(g.cards) : renderCards(g.cards)}
                {g.outro && <p className={styles.outro}>{txt(g.outro)}</p>}
              </div>
            </div>
          ))}

          {s.outro && <p className={styles.outro}>{txt(s.outro)}</p>}
        </section>
      ))}

      {query && shown.length === 0 && <p className={styles.empty}>{notFoundText}</p>}
      {zoom && <CardZoomOverlay key={zoom.id} card={zoom} onClose={() => setZoom(null)} />}
    </div>
  )
}
