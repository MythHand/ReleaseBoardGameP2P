import styles from './App.module.css'

// Фаза 0 — фундамент. Корень = реальное приложение (НЕ песочница).
// Пока это нейтральная заглушка-оболочка; по фазам станет роутером экранов:
// boot → start → lobby → game → game over. Превью токенов/типографики живёт в /playground/.
export default function App() {
  return (
    <div className={styles.app}>
      <main className={styles.shell}>
        <h1 className={styles.brand}>
          Release <span className={styles.sub}>любой ценой</span>
        </h1>
        <p className={styles.tag}>visual layer — foundation</p>
        <p className={styles.hint}>
          Экраны (boot → lobby → game → game over) появятся по фазам.
        </p>
        <p className={styles.dev}>
          dev-витрина компонентов → <a className={styles.link} href="/playground/">/playground/</a>
        </p>
      </main>
    </div>
  )
}
