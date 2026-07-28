import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { play } from '@/animations'

interface RevealProps {
  // whether the content should be present
  when: boolean
  className?: string
  children: ReactNode
}

// Reveal — mounts children while `when` is true (playing popIn on entry) and,
// on when→false, keeps them one beat to play popOut before unmounting. The
// surrounding slot reserves space, so appear/disappear never shifts neighbours.
export default function Reveal({ when, className, children }: RevealProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(when)
  const [mounted, setMounted] = useState(when)

  useLayoutEffect(() => {
    if (when === prev.current) return
    prev.current = when
    if (when) {
      setMounted(true)
      return
    }
    const el = ref.current
    if (!el) {
      setMounted(false)
      return
    }
    const anim = play('popOut', el)
    if (anim) anim.finished.then(() => setMounted(false)).catch(() => {})
    else setMounted(false)
  }, [when])

  // play popIn once the node is actually in the DOM
  useLayoutEffect(() => {
    if (mounted && when) play('popIn', ref.current)
  }, [mounted, when])

  if (!mounted) return null
  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  )
}
