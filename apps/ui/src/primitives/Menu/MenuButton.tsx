import { type ButtonHTMLAttributes, type ReactNode, useContext, useRef, useState } from 'react'
import Button from '../Button'
import { MenuContext } from './Menu'

interface MenuButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}

export default function MenuButton({
  children,
  onFocus,
  tabIndex: tabIndexProp,
  ...rest
}: MenuButtonProps) {
  const context = useContext(MenuContext)
  const ref = useRef<HTMLButtonElement>(null)

  // Register with the parent Menu on first render; -1 = standalone (no context)
  const [myIndex] = useState(() => (context ? context.registerItem(ref) : -1))

  const isActive = context !== null && context.activeIndex === myIndex

  return (
    <Button
      ref={ref}
      role={context ? 'menuitem' : undefined}
      tabIndex={context ? (isActive ? 0 : -1) : (tabIndexProp ?? 0)}
      onFocus={(e) => {
        if (context) context.setActiveIndex(myIndex)
        onFocus?.(e)
      }}
      {...rest}
    >
      {children}
    </Button>
  )
}
