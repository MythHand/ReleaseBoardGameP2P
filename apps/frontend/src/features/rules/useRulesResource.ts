import { loadRules, useTranslation } from '@release/translation'
import { useEffect, useState } from 'react'

export function useRulesResource(enabled: boolean) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en'
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{
    language: string
    status: 'idle' | 'loading' | 'ready' | 'error'
    error?: unknown
  }>({ language, status: 'idle' })
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries a failed resource.
  useEffect(() => {
    if (!enabled) return
    let active = true
    setState({ language, status: 'loading' })
    void loadRules(language).then(
      () => {
        if (active) setState({ language, status: 'ready' })
      },
      (error: unknown) => {
        if (active) setState({ language, status: 'error', error })
      },
    )
    return () => {
      active = false
    }
  }, [enabled, language, attempt])
  return {
    ...state,
    status: state.language === language ? state.status : ('loading' as const),
    retry: () => setAttempt((n) => n + 1),
  }
}
