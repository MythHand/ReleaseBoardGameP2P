import Rules, { RULES_COPY_EN, RULES_COPY_RU } from '@/blocks/Rules'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'
import styles from './RulesBlock.module.css'

// Превью правил в контексте окна: контентная область ограничена шириной широкой
// модалки (Modal `wide`), фон/граница повторяют панель модалки. Готовый элемент
// Rules из @release/ui; текст — по языку из тумблера плейграунда (RU/EN).
export default function RulesBlock() {
  const { lang } = useLang()
  return (
    <KitPage title="Rules" tag="блок">
      <KitSection title="Превью в окне — ширина широкой модалки">
        <div className={styles.panel}>
          <Rules copy={pick(lang, { ru: RULES_COPY_RU, en: RULES_COPY_EN })} />
        </div>
      </KitSection>
    </KitPage>
  )
}
