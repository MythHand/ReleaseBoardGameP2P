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
      ru: 'Игровая карта и веер руки — базовые сущности стола.',
      en: 'The game card and the hand fan — core table entities.',
    },
  },
  {
    name: { ru: 'Интерактив', en: 'Interactive' },
    desc: {
      ru: 'Живые сценарии анимаций: розыгрыш, добор, комбо, адресная стрелка и работа с колодами.',
      en: 'Live animation scenarios: play, draw, combos, the targeting arrow and deck handling.',
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
      ru: 'Индикаторы и поверхности: бейджи, аватары, стопки, модалки, оверлеи, свечения, спиннер.',
      en: 'Indicators and surfaces: badges, avatars, piles, modals, overlays, glows, spinner.',
    },
  },
  {
    name: { ru: 'Блоки', en: 'Blocks' },
    desc: {
      ru: 'Композитные куски экранов из примитивов: настройки, правила, меню, места игроков и прочее.',
      en: 'Composite screen pieces built from primitives: settings, rules, menu, player seats and more.',
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
