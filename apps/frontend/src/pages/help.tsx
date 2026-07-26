import { useTranslation } from '@release/translation'
import { Typography } from '@release/ui'
import { Link } from 'react-router'
import styles from './help.module.css'

export default function HelpPage() {
  const { t } = useTranslation()
  return (
    <main className={styles.page}>
      <Typography variant="pageTitle" className={styles.title}>
        {t('help.title')}
      </Typography>
      <Link to="/start" className={styles.back}>
        <Typography base="body">{t('help.back')}</Typography>
      </Link>
    </main>
  )
}
