import { useLayoutEffect } from 'react'
import { type UseLobby, useLobby } from '~/network'

export default function SessionRuntime({ publish }: { publish(value: UseLobby): void }) {
  const lobby = useLobby()
  useLayoutEffect(() => publish(lobby), [lobby, publish])
  return null
}
