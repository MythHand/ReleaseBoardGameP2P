import { useTranslation } from 'react-i18next'
import LanguageSwitch from './components/LanguageSwitch'
import styles from './App.module.css'

// Фаза 0 — фундамент. Корень = реальное приложение (НЕ песочница).
// Пока это нейтральная заглушка-оболочка; по фазам станет роутером экранов:
// boot → start → lobby → game → game over. Превью токенов/типографики живёт в /playground/.
export default function App() {
  const { t } = useTranslation()
  return (
    <div className={styles.app}>
      <LanguageSwitch />
      <main className={styles.shell}>
        <h1 className={styles.brand}>
          {t('app.titleLead')} <span className={styles.sub}>{t('app.titleSub')}</span>
        </h1>
        <p className={styles.tag}>{t('app.foundationTag')}</p>
        <p className={styles.hint}>{t('app.phasesHint')}</p>
        <p className={styles.dev}>
          {t('app.devShowcase')} <a className={styles.link} href="/playground/">/playground/</a>
        </p>
      </main>
    </div>
  )
}
