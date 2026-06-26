import { useLang } from '../../Playground/lang'
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

export default function WelcomeStory() {
  const { lang } = useLang()
  const t = COPY[lang]

  return (
    <div className={styles.root}>
      <div className={styles.tag}>{t.tag}</div>
      <h1 className={styles.title}>{t.title}</h1>
      <p className={styles.lead}>{t.lead}</p>
      <p className={styles.body}>{t.body}</p>
    </div>
  )
}
