import { useTranslation } from '@release/translation'
import { Link } from 'react-router'
import styles from './help.module.css'

export default function HelpPage() {
  const { t } = useTranslation()
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{t('help.title')}</h1>
      <Link to="/start" className={styles.back}>
        {t('help.back')}
      </Link>
    </main>
  )
}
