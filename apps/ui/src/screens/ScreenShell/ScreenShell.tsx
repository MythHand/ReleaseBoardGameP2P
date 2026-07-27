import type { ReactNode } from 'react'
import LangSwitcher, { type SwitchLang } from '@/blocks/LangSwitcher'
import PhysicalEdition, { type PhysicalEditionCopy } from '@/blocks/PhysicalEdition'
import ReleaseLogo from '@/brand/ReleaseLogo'
import HudBackground from '@/primitives/HudBackground'
import styles from './ScreenShell.module.css'

// заказ/предзаказ печатной версии — Instagram команды; один и тот же адрес на
// всех экранах, поэтому живёт здесь, а не у каждого консьюмера
const INSTAGRAM_URL = 'https://www.instagram.com/mythhand.team/'

export interface ScreenShellProps {
  // вариант начертания логотипа под язык интерфейса
  logoVariant?: 'ru' | 'en'
  tags: string[]
  description: string
  // язык + смена: когда оба переданы — в правом верхнем углу рисуется свитчер
  lang?: SwitchLang
  onLangChange?: (lang: SwitchLang) => void
  // блок печатной версии в правом нижнем углу; без копирайта не рисуется
  physicalEditionCopy?: PhysicalEditionCopy
  // прочие абсолютно спозиционированные блоки экрана (авторство, видео)
  corners?: ReactNode
  // тело колонки под описанием — меню на Start, форма на Invite. Свой верхний
  // отступ задаёт само тело (.desc его не держит)
  children?: ReactNode
}

// Оболочка экрана: всё, что общего у Start и Invite — слоёный фон, угол языка,
// левая колонка (логотип, теги, описание) и печатная версия в углу.
export default function ScreenShell({
  logoVariant,
  tags,
  description,
  lang,
  onLangChange,
  physicalEditionCopy,
  corners,
  children,
}: ScreenShellProps) {
  return (
    <div className={styles.root}>
      <div className={styles.bg} />
      <div className={styles.blur} />
      <div className={styles.scrim} />
      {/* HUD-сетка: над градиентом/картинкой, под контентом */}
      <HudBackground tone="grid" className={styles.bgLayer} />

      {lang && onLangChange && (
        <>
          <div className={styles.langShade} />
          <div className={styles.langCorner}>
            <LangSwitcher value={lang} onChange={onLangChange} />
          </div>
        </>
      )}

      <div className={styles.content}>
        <div className={styles.col}>
          <ReleaseLogo className={styles.logo} variant={logoVariant} />
          <div className={styles.tags}>
            {tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
          </div>
          <p className={styles.desc}>{description}</p>
          {children}
        </div>
      </div>

      {corners}

      {physicalEditionCopy && (
        <PhysicalEdition
          href={INSTAGRAM_URL}
          copy={physicalEditionCopy}
          className={styles.physical}
        />
      )}
    </div>
  )
}
