import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from 'react'
import styles from './Menu.module.css'

export interface MenuContextValue {
  activeIndex: number
  setActiveIndex: (i: number) => void
  registerItem: (ref: React.RefObject<HTMLButtonElement | null>) => number
}

export const MenuContext = createContext<MenuContextValue | null>(null)

interface MenuProps {
  children: ReactNode
  className?: string
}

export default function Menu({ children, className = '' }: MenuProps) {
  const refs = useRef<React.RefObject<HTMLButtonElement | null>[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  const registerItem = useCallback((ref: React.RefObject<HTMLButtonElement | null>) => {
    const existing = refs.current.indexOf(ref)
    if (existing !== -1) return existing // StrictMode double-call: return existing index
    const index = refs.current.length
    refs.current.push(ref)
    return index
  }, [])

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const count = refs.current.length
    if (count === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = (activeIndex + 1) % count
      setActiveIndex(next)
      refs.current[next]?.current?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = (activeIndex - 1 + count) % count
      setActiveIndex(prev)
      refs.current[prev]?.current?.focus()
    }
  }

  return (
    <MenuContext.Provider value={{ activeIndex, setActiveIndex, registerItem }}>
      <div role="menu" className={`${styles.menu} ${className}`} onKeyDown={handleKeyDown}>
        {children}
      </div>
    </MenuContext.Provider>
  )
}
