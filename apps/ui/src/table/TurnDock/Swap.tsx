import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { play } from '@/animations'
import styles from './Swap.module.css'

// Motion of one swap — set by the caller per slot, by the weight of the change.
export interface SwapMotion {
  out?: number
  in?: number
  // hold the incoming invisible this long before it fades in — so the outgoing
  // clears first (sequential, no overlap). Used for the opponent name.
  delayIn?: number
}

const DEFAULT: Required<SwapMotion> = { out: 220, in: 300, delayIn: 0 }

interface SwapProps {
  // when this token changes, the slot cross-fades from the old content to the new
  token: string
  anim?: SwapMotion
  // Reserve a FIXED box sized to the widest content (rendered hidden); the live
  // and outgoing layers are overlaid on it. The slot never resizes, so text
  // fades in place with no reflow. Pass the longest possible value here.
  sizer?: ReactNode
  // how the content sits inside the reserved box (sizer mode). default: center.
  align?: 'start' | 'center'
  // fill the parent's width (100%) instead of reserving a sizer — for the
  // fixed-width action key/name slot.
  fill?: boolean
  className?: string
  children: ReactNode
}

// A snapshot of the departing content, kept only while it fades out. (Internal
// to the cross-fade — unrelated to any game "paused" state.)
interface Outgoing {
  node: ReactNode
}

// Swap — cross-fades a slot's content when `token` changes, by opacity only (no
// movement, no reflow). The slot's size is fixed up front: either a hidden sizer
// (widest content) or fill=100% of a fixed parent. Live + outgoing layers are
// overlaid; the incoming is positioned correctly from frame one, so it fades in
// place — it never appears then jumps.
export default function Swap({
  token,
  anim,
  sizer,
  align = 'center',
  fill,
  className,
  children,
}: SwapProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const prevToken = useRef(token)
  const prevNode = useRef<ReactNode>(children)
  const [outgoing, setOutgoing] = useState<Outgoing | null>(null)

  // Detect a token change after each commit: snapshot the previous content as the
  // outgoing layer. prevNode trails the last-rendered children by one commit.
  useLayoutEffect(() => {
    if (token !== prevToken.current) {
      setOutgoing({ node: prevNode.current })
      prevToken.current = token
    }
    prevNode.current = children
  })

  // Run the cross-fade whenever an outgoing snapshot appears, then clear it.
  // :scope > … so nested Swaps don't steal each other's layers.
  useLayoutEffect(() => {
    if (!outgoing) return
    const el = ref.current
    if (!el) {
      setOutgoing(null)
      return
    }
    const m = { ...DEFAULT, ...anim }
    const live = el.querySelector<HTMLElement>(':scope > [data-live]')
    const out = el.querySelector<HTMLElement>(':scope > [data-out]')
    play('rollIn', live, { dur: m.in, delay: m.delayIn })
    const a = play('rollOut', out, { dur: m.out })
    if (a) a.finished.then(() => setOutgoing(null)).catch(() => {})
    else setOutgoing(null)
  }, [outgoing, anim])

  const cls = [
    styles.swap,
    sizer != null && styles.sized,
    sizer != null && (align === 'start' ? styles.start : styles.center),
    fill && styles.fill,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span ref={ref} className={cls}>
      {sizer != null && (
        <span className={styles.sizer} aria-hidden="true">
          {sizer}
        </span>
      )}
      <span className={styles.layer} data-live>
        {children}
      </span>
      {outgoing && (
        <span className={styles.layer} data-out aria-hidden="true">
          {outgoing.node}
        </span>
      )}
    </span>
  )
}
