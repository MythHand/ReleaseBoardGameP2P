import { useTranslation } from '@release/translation'
import { Button, Spinner, Typography } from '@release/ui/foundation'
import { classifyLoadFailure } from '../lib/loadFailure'
import styles from './LoadingStatus.module.css'

export default function LoadingStatus({
  error,
  onRetry,
  onRefresh,
}: {
  error?: unknown
  onRetry?: () => void
  onRefresh?: () => void
}) {
  const { t } = useTranslation()
  if (!error)
    return (
      <div
        className={`${styles.root} ${styles.pending}`}
        role="status"
        aria-label={t('loading.status')}
        aria-live="polite"
        aria-busy="true"
      >
        <Spinner size={40} />
      </div>
    )
  const offline = error && classifyLoadFailure(error, navigator.onLine) === 'offline'
  const refreshRequired = error && classifyLoadFailure(error, true) === 'load'
  return (
    <div className={styles.root} role="status" aria-live="polite" aria-busy={!error}>
      <Typography base="body">
        {t(
          offline
            ? 'loading.offline'
            : refreshRequired
              ? 'loading.refreshRequired'
              : error
                ? 'loading.failed'
                : 'loading.status',
        )}
      </Typography>
      {error ? (
        <div className={styles.actions}>
          {onRetry && !refreshRequired && <Button onClick={onRetry}>{t('loading.retry')}</Button>}
          <Button variant="tech" onClick={onRefresh ?? (() => window.location.reload())}>
            {t('loading.refresh')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
