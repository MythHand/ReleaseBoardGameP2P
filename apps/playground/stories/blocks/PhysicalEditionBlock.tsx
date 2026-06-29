import PhysicalEdition, {
  PHYSICAL_EDITION_COPY_EN,
  PHYSICAL_EDITION_COPY_RU,
} from '@/blocks/PhysicalEdition'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'
import styles from './PhysicalEditionBlock.module.css'

// ссылка на заказ/предзаказ — Instagram команды (как на стартовом экране)
const INSTAGRAM_URL = 'https://www.instagram.com/mythhand.team/'

// Блок «печатная версия»: матовая плашка с заголовком, подписью и ссылкой на
// заказ + арт коробки, выпирающий за верхнюю грань. Текст — по языку тумблера.
export default function PhysicalEditionBlock() {
  const { lang } = useLang()
  return (
    <KitPage title="Physical edition" tag="блок">
      <KitSection title="Плашка печатного издания — во всю доступную ширину">
        <div className={styles.panel}>
          <PhysicalEdition
            href={INSTAGRAM_URL}
            copy={pick(lang, { ru: PHYSICAL_EDITION_COPY_RU, en: PHYSICAL_EDITION_COPY_EN })}
            className={styles.placed}
          />
        </div>
      </KitSection>
    </KitPage>
  )
}
