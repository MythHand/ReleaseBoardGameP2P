import { useTranslation } from '@release/translation'
import { Rules as RulesView } from '@release/ui'
import { memo, useLayoutEffect, useMemo } from 'react'
import LoadingStatus from '~/shared/ui/LoadingStatus'
import { useRulesResource } from './useRulesResource'

// Keep heavy rules copy stable across unrelated board updates.
export default memo(function Rules({
  enabled = true,
  onReady,
}: {
  enabled?: boolean
  onReady?: () => void
}) {
  const { t } = useTranslation()
  const resource = useRulesResource(enabled)
  const copy = useMemo(
    () => (resource.status === 'ready' ? t('rulesBlock', { returnObjects: true }) : null),
    [t, resource.status],
  )
  useLayoutEffect(() => {
    if (resource.status === 'ready') onReady?.()
  }, [resource.status, onReady])
  if (resource.status === 'idle') return null
  if (resource.status !== 'ready')
    return <LoadingStatus error={resource.error} onRetry={resource.retry} />
  return copy ? <RulesView copy={copy} /> : null
})
