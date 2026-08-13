import { useState } from 'react'
import Button from '@/primitives/Button'
import Modal from '@/primitives/Modal'
import Typography from '@/primitives/Typography'
import { useLang } from '../../Playground/lang'
import { KitPage, KitSection } from './KitShell'
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
    filler: 'область демонстрации — модалка накрывает её, а не всё окно',
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
    filler: 'the demo area — the modal covers this, not the whole window',
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
        <div className={styles.wrap}>
          <div className={styles.controls}>
            <Button variant="tech" onClick={() => setOpen('std')}>
              {t.open}
            </Button>
            <Button variant="tech" onClick={() => setOpen('wide')}>
              {t.openWide}
            </Button>
          </div>

          {/* In the GAME a modal covers the whole screen. Here it covers the DEMO
              AREA: this box contains its position:fixed overlay, so the modal
              stops at the playground navigation instead of swallowing it. */}
          <div className={styles.stage}>
            <div className={styles.filler}>
              <Typography base="mono-xs">{t.filler}</Typography>
            </div>

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
          </div>
        </div>
      </KitSection>
    </KitPage>
  )
}
