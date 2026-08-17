import type { ReactNode } from 'react'
import styles from './Toast.module.css'
import { useAppear } from './useAppear'

interface ToastProps {
  children: ReactNode
  // уход начался: очередь попросила закрыться. Тост сам доигрывает уход и
  // сообщает `onLeft` — снять его со сцены раньше значит оборвать анимацию.
  leaving?: boolean
  onLeft?: () => void
  onClick?: () => void
  className?: string
}

// Одна всплывающая плашка: чёрная подложка и то, что в неё положили. Ничего
// своего она содержимому не добавляет — ни рамки, ни отступов.
// Появление и уход — забота самого тоста, а не того, кто его показывает.
export default function Toast({
  children,
  leaving = false,
  onLeft,
  onClick,
  className = '',
}: ToastProps) {
  const ref = useAppear<HTMLButtonElement>(leaving, onLeft)

  return (
    <button ref={ref} type="button" className={`${styles.toast} ${className}`} onClick={onClick}>
      {children}
    </button>
  )
}
