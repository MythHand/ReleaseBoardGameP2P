import { useTranslation } from '@release/translation'
import { Button, Typography } from '@release/ui'
import styles from './LoadingStatus.module.css'
import { classifyLoadFailure } from '../lib/loadFailure'

export default function LoadingStatus({ error, onRetry, onRefresh }: {
  error?: unknown
  onRetry?: () => void
  onRefresh?: () => void
}) {
  const { t } = useTranslation()
  const offline = error && classifyLoadFailure(error, navigator.onLine) === 'offline'
  return (
    <div className={styles.root} role="status" aria-live="polite" aria-busy={!error}>
      <Typography base="body">{t(offline ? 'loading.offline' : error ? 'loading.failed' : 'loading.status')}</Typography>
      {error ? (
        <div className={styles.actions}>
          {onRetry && <Button onClick={onRetry}>{t('loading.retry')}</Button>}
          <Button variant="tech" onClick={onRefresh ?? (() => window.location.reload())}>
            {t('loading.refresh')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
