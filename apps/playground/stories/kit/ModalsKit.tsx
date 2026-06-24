import { useState } from 'react'
import Button from '@/primitives/Button'
import Modal from '@/primitives/Modal'
import { KitCell, KitPage, KitSection } from './KitShell'
import styles from './ModalsKit.module.css'

// Реальный примитив Modal: обычная ширина и широкий вариант (двухколоночные формы).
export default function ModalsKit() {
  const [open, setOpen] = useState<'std' | 'wide' | null>(null)
  const close = () => setOpen(null)

  return (
    <KitPage title="Modals">
      <KitSection title="Варианты ширины">
        <KitCell caption="standard">
          <Button variant="tech" onClick={() => setOpen('std')}>
            открыть
          </Button>
        </KitCell>
        <KitCell caption="wide">
          <Button variant="tech" onClick={() => setOpen('wide')}>
            открыть широкую
          </Button>
        </KitCell>
      </KitSection>

      <Modal open={open === 'std'} onClose={close} title="Заголовок модалки">
        <p className={styles.text}>
          Плавное появление и закрытие (fade + scale). Закрытие по кнопке ✕, клику по фону или
          Escape.
        </p>
        <div className={styles.actions}>
          <Button variant="tech" onClick={close}>
            отмена
          </Button>
          <Button variant="tech" onClick={close}>
            ок
          </Button>
        </div>
      </Modal>

      <Modal open={open === 'wide'} onClose={close} title="Широкая модалка" wide>
        <p className={styles.text}>
          Вариант <code>wide</code> — для двухколоночных форм (например, создание игры).
        </p>
      </Modal>
    </KitPage>
  )
}
