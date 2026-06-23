import { useTranslation } from '@release/translation'
import { Button } from '@release/ui'

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
  const detail = import.meta.env.DEV ? messageOf(error) : null

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg p-6 text-center text-fg">
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-xl tracking-base">{t('error.title')}</h1>
        <p className="max-w-sm text-fg/60 text-sm">{t('error.description')}</p>
      </div>
      {detail && (
        <pre className="max-w-md overflow-auto rounded-md border border-fg/10 bg-surface-1 p-3 text-left text-fg/70 text-xs">
          {detail}
        </pre>
      )}
      <div className="inline-flex gap-2">
        <Button onClick={() => window.location.reload()}>{t('error.reload')}</Button>
        <Button variant="tech" onClick={() => window.location.assign('/start')}>
          {t('error.backToStart')}
        </Button>
      </div>
    </div>
  )
}
