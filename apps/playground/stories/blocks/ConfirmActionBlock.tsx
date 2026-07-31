import { useState } from 'react'
import Button from '@/primitives/Button'
import Typography from '@/primitives/Typography'
import ConfirmAction from '@/table/ConfirmAction'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'
import styles from './ConfirmActionBlock.module.css'

// Confirm action — the shared "confirm the selection" bar for every interactive
// pick flow (Git Cherry-pick, Git Rebase, and future ones). A full block with
// its own surface + swappable caption slot, that slides up from the bottom of
// its container over the content, at the top layer. Toggle it live below.
export default function ConfirmActionBlock() {
  const { lang } = useLang()
  const [open, setOpen] = useState(true)
  const [withCaption, setWithCaption] = useState(true)
  const [disabled, setDisabled] = useState(false)

  const label = pick(lang, { ru: 'подтвердить', en: 'confirm' })
  const w = pick(lang, {
    ru: {
      live: 'Живьё — выезд снизу',
      caption: 'выбери 2: одна в руку, вторая на верх колоды',
      toggleOpen: 'показать / скрыть',
      toggleCaption: 'подпись',
      toggleDisabled: 'неактивна',
      filler: 'контент стола — панель выезжает поверх него',
      notes: 'Идея',
      note: 'Полноценный блок, а не голая кнопка: свой фон, слот под подпись (включается, где нужна), выезд снизу в нахлёст контента со своей анимацией появления/исчезновения, на самом верхнем слое области. Один блок — общий вид и поведение подтверждения во всех интерактивах.',
    },
    en: {
      live: 'Live — slide up from the bottom',
      caption: 'choose 2: one to hand, one onto the deck top',
      toggleOpen: 'show / hide',
      toggleCaption: 'caption',
      toggleDisabled: 'disabled',
      filler: 'table content — the bar slides up over it',
      notes: 'Idea',
      note: 'A full block, not a bare button: its own surface, a caption slot (enabled where needed), a slide-up over the content with its own enter / exit animation, at the top layer of the area. One block — the same look and behaviour of confirmation across every interactive flow.',
    },
  })

  return (
    <KitPage title="Confirm action" tag="block">
      <KitSection title={w.live}>
        <div className={styles.wrap}>
          <div className={styles.controls}>
            <Button variant="tech" onClick={() => setOpen((v) => !v)}>
              {w.toggleOpen}
            </Button>
            <Button variant="tech" onClick={() => setWithCaption((v) => !v)}>
              {w.toggleCaption}
            </Button>
            <Button variant="tech" onClick={() => setDisabled((v) => !v)}>
              {w.toggleDisabled}
            </Button>
          </div>

          {/* a mini "table area": the bar pins to the bottom of this box and
              slides up over the filler content */}
          <div className={styles.stage}>
            <div className={styles.filler}>
              <Typography base="mono-xs">{w.filler}</Typography>
            </div>
            <ConfirmAction
              open={open}
              label={label}
              disabled={disabled}
              caption={withCaption ? w.caption : undefined}
              onConfirm={() => setOpen(false)}
            />
          </div>
        </div>
      </KitSection>

      <KitSection title={w.notes}>
        <Typography base="mono-xs">{w.note}</Typography>
      </KitSection>
    </KitPage>
  )
}
