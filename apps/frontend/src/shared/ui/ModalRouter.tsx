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
  return (e: MouseEvent<HTMLButtonElement>) => setParams({ [param]: e.currentTarget.value })
}

export default function ModalRouter({ param = 'modal', routes }: ModalRouterProps) {
  const [params, setParams] = useSearchParams()
  const active = params.get(param)
  const close = () => setParams({})

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
