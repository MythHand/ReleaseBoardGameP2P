import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  getKeyboardRegistry,
  INACTIVE_LAYER,
  type KeyboardLayerOptions,
  type KeyboardLayerState,
} from './registry'

const inactiveSnapshot = () => INACTIVE_LAYER
const noSubscription = () => () => {}

export function useKeyboardLayer(
  options: KeyboardLayerOptions,
  owner?: Window,
): KeyboardLayerState {
  const target = owner ?? (typeof window === 'undefined' ? undefined : window)
  // Creating a handle neither registers nor attaches a listener. Only a commit
  // may expose its handlers, so abandoned renders cannot own keyboard input.
  const handle = useMemo(
    () => (target ? getKeyboardRegistry(target).createLayer() : null),
    [target],
  )
  const committed = useRef(options)
  useLayoutEffect(() => {
    committed.current = options
    handle?.update(options)
  })
  useLayoutEffect(() => handle?.mount(committed.current), [handle])
  return useSyncExternalStore(
    handle?.subscribe ?? noSubscription,
    handle?.getSnapshot ?? inactiveSnapshot,
    inactiveSnapshot,
  )
}
