import { useState } from 'react'
import Button from '@/primitives/Button'
import Modal from '@/primitives/Modal'
import { useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from './KitShell'
import styles from './ModalsKit.module.css'

// The real Modal primitive: standard width and a wide variant (two-column forms).
const COPY = {
  ru: {
    widths: 'Варианты ширины',
    open: 'открыть',
    openWide: 'открыть широкую',
    stdTitle: 'Заголовок модалки',
    stdText:
      'Плавное появление и закрытие (fade + scale). Закрытие по кнопке ✕, клику по фону или Escape.',
    cancel: 'отмена',
    ok: 'ок',
    wideTitle: 'Широкая модалка',
    wideLead: '— для двухколоночных форм (например, создание игры).',
  },
  en: {
    widths: 'Width variants',
    open: 'open',
    openWide: 'open wide',
    stdTitle: 'Modal title',
    stdText:
      'Smooth open and close (fade + scale). Close via the ✕ button, backdrop click or Escape.',
    cancel: 'cancel',
    ok: 'ok',
    wideTitle: 'Wide modal',
    wideLead: '— for two-column forms (e.g. game creation).',
  },
}

export default function ModalsKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  const [open, setOpen] = useState<'std' | 'wide' | null>(null)
  const close = () => setOpen(null)

  return (
    <KitPage title="Modals">
      <KitSection title={t.widths}>
        <KitCell caption="standard">
          <Button variant="tech" onClick={() => setOpen('std')}>
            {t.open}
          </Button>
        </KitCell>
        <KitCell caption="wide">
          <Button variant="tech" onClick={() => setOpen('wide')}>
            {t.openWide}
          </Button>
        </KitCell>
      </KitSection>

      <Modal open={open === 'std'} onClose={close} title={t.stdTitle}>
        <p className={styles.text}>{t.stdText}</p>
        <div className={styles.actions}>
          <Button variant="tech" onClick={close}>
            {t.cancel}
          </Button>
          <Button variant="tech" onClick={close}>
            {t.ok}
          </Button>
        </div>
      </Modal>

      <Modal open={open === 'wide'} onClose={close} title={t.wideTitle} wide>
        <p className={styles.text}>
          <code>wide</code> {t.wideLead}
        </p>
      </Modal>
    </KitPage>
  )
}
