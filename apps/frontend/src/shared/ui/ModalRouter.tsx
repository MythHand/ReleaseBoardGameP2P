import { Modal } from '@release/ui'
import type { MouseEvent, ReactNode } from 'react'
import { useRef } from 'react'
import { useSearchParams } from 'react-router'

interface RouteConfig {
  title: ReactNode
  children: ReactNode
  wide?: boolean
}

interface ModalRouterProps {
  param?: string
  routes: Record<string, RouteConfig>
}

export function useModalRoute(param = 'modal') {
  const [, setParams] = useSearchParams()
  // Merge into the current query so any unrelated params (e.g. invite/ref) survive.
  return (e: MouseEvent<HTMLButtonElement>) => {
    const value = e.currentTarget.value
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set(param, value)
      return next
    })
  }
}

export default function ModalRouter({ param = 'modal', routes }: ModalRouterProps) {
  const [params, setParams] = useSearchParams()
  const active = params.get(param)
  const close = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete(param)
      return next
    })

  const config = active ? routes[active] : null
  // Preserve content during exit animation so it doesn't flash empty while fading out
  const lastConfig = useRef(config)
  if (config) lastConfig.current = config
  const current = lastConfig.current

  return (
    <Modal open={!!config} onClose={close} title={current?.title} wide={current?.wide}>
      {current?.children ?? null}
    </Modal>
  )
}
