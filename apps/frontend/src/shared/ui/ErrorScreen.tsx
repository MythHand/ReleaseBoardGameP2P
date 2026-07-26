import { useTranslation } from '@release/translation'
import { Button, Typography } from '@release/ui'
import { BASE_URL, IS_DEV } from '~/shared/config'
import styles from './ErrorScreen.module.css'

function messageOf(error: unknown): string | null {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return null
}

/**
 * App-shell fallback rendered by the root route ErrorBoundary (`Catch` in `_app.tsx`)
 * when a render/loader error escapes a page. The raw error detail is shown in dev only.
 */
export default function ErrorScreen({ error }: { error?: unknown }) {
  const { t } = useTranslation()
  const detail = IS_DEV ? messageOf(error) : null

  return (
    <div className={styles.root}>
      <div className={styles.text}>
        <Typography variant="panelTitle" as="h1" className={styles.title}>
          {t('error.title')}
        </Typography>
        <Typography base="body" as="p" className={styles.desc}>
          {t('error.description')}
        </Typography>
      </div>
      {detail && (
        <Typography base="mono-sm" as="pre" className={styles.detail}>
          {detail}
        </Typography>
      )}
      <div className={styles.actions}>
        <Button onClick={() => window.location.reload()}>{t('error.reload')}</Button>
        <Button variant="tech" onClick={() => window.location.assign(BASE_URL)}>
          {t('error.backToStart')}
        </Button>
      </div>
    </div>
  )
}
