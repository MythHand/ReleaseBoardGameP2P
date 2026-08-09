import { pick, useLang } from '../../Playground/lang'
import styles from './WelcomeStory.module.css'

const COPY = {
  ru: {
    tag: 'добро пожаловать',
    title: 'Playground',
    lead: 'Витрина UI-библиотеки «Release любой ценой».',
    body: 'Живые примитивы, блоки и экраны из @release/ui, собранные в изоляции — чтобы каждый кусок можно было потрогать, выверить состояния и довести до ума отдельно от игры.',
  },
  en: {
    tag: 'welcome',
    title: 'Playground',
    lead: 'UI library showcase for «Release любой ценой».',
    body: 'Live primitives, blocks and screens from @release/ui, assembled in isolation — so each piece can be inspected, tuned and polished apart from the game.',
  },
}

// Map of nav sections — what each sidebar group holds. Section names mirror the
// sidebar group headings; kept in sync with the groups in Playground.tsx.
interface Loc {
  ru: string
  en: string
}
const SECTIONS: { name: Loc; desc: Loc }[] = [
  {
    name: { ru: 'Экраны', en: 'Screens' },
    desc: {
      ru: 'Слепки целых экранов игры — от загрузки и входа до стола и статистики, собранные из блоков.',
      en: 'Whole-screen snapshots — from loading and entry to the table and stats — assembled from blocks.',
    },
  },
  {
    name: { ru: 'Основа', en: 'Foundations' },
    desc: {
      ru: 'Дизайн-токены: цвета, типографика и текстовые стили — фундамент всей библиотеки.',
      en: 'Design tokens: colors, typography and text styles — the base of the whole library.',
    },
  },
  {
    name: { ru: 'Карты', en: 'Cards' },
    desc: {
      ru: 'Игровая карта и веер руки — базовые сущности стола, плюс правило лимита руки на том же веере.',
      en: 'The game card and the hand fan — the core table entities — plus the hand-limit rule on that same fan.',
    },
  },
  {
    name: { ru: 'Интерактив', en: 'Interactive' },
    desc: {
      ru: 'Живые сценарии анимаций: розыгрыш и добор, комбо, адресная стрелка, работа с колодами, ход с Error 503, защита релиза, эффекты AI-карт и Git-карты. Первая страница группы — Interaction audit: карта состояния всей анимационной работы, что готово и что требует доработок.',
      en: 'Live animation scenarios: play and draw, combos, the targeting arrow, deck handling, the Error 503 turn, defending a release, AI-card effects and the Git cards. The first page of the group is Interaction audit — the state map of all animation work: what is ready and what still needs it.',
    },
  },
  {
    name: { ru: 'UI KIT · контролы', en: 'UI KIT · controls' },
    desc: {
      ru: 'Элементы ввода и выбора: кнопки, поля, тумблеры, слайдеры, дропдауны, табы.',
      en: 'Input and selection elements: buttons, fields, toggles, sliders, dropdowns, tabs.',
    },
  },
  {
    name: { ru: 'UI KIT · поверхности', en: 'UI KIT · surfaces' },
    desc: {
      ru: 'Индикаторы и поверхности: бейджи, аватары, стопки, модалки, шторка, оверлеи, краевое свечение, спиннер, видеоплеер.',
      en: 'Indicators and surfaces: badges, avatars, piles, modals, drawer, overlays, edge glow, spinner, video player.',
    },
  },
  {
    name: { ru: 'UI KIT · HUD', en: 'UI KIT · HUD' },
    desc: {
      ru: 'Служебный игровой интерфейс: таймер хода, индикатор состояния, поверхность и фон HUD.',
      en: 'The in-game service interface: the turn timer, the status dot, the HUD surface and its background.',
    },
  },
  {
    name: { ru: 'Блоки', en: 'Blocks' },
    desc: {
      ru: 'Композитные куски экранов из примитивов: настройки и правила, меню, место игрока и зона релизов, док хода, участники, история ходов, переподключение и конец игры.',
      en: 'Composite screen pieces built from primitives: settings and rules, the menu, a player seat and the release zone, the turn dock, participants, move history, reconnect and game over.',
    },
  },
]

export default function WelcomeStory() {
  const { lang } = useLang()
  const t = COPY[lang]

  return (
    <div className={styles.root}>
      <div className={styles.tag}>{t.tag}</div>
      <h1 className={styles.title}>{t.title}</h1>
      <p className={styles.lead}>{t.lead}</p>
      <p className={styles.body}>{t.body}</p>

      <dl className={styles.sections}>
        {SECTIONS.map((s) => (
          <div key={s.name.ru} className={styles.sectionRow}>
            <dt className={styles.sectionName}>{pick(lang, s.name)}</dt>
            <dd className={styles.sectionDesc}>{pick(lang, s.desc)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
