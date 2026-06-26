import Rules from '@/screens/Start/Rules'
import styles from './RulesBlock.module.css'

// Превью свежей версии правил в контексте окна: контентная область ограничена
// шириной широкой модалки (Modal `wide`), фон и граница повторяют панель модалки,
// чтобы видеть правила ровно так, как они лягут в окне.
//
// Готовый элемент — Rules из @release/ui. RU-текст зашит в самом компоненте;
// EN подключится позже через каталоги переводов (компонент i18n-агностичен и
// принимает copy пропсами — playground лишь рендерит готовый элемент).
export default function RulesBlock() {
  return (
    <div className={styles.stage}>
      <div className={styles.panel}>
        <Rules />
      </div>
    </div>
  )
}
