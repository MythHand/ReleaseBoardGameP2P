import styles from './Stub.module.css'

// Заглушка интерактивной страницы — наполнение добавим позже.
export default function Stub({ title }: { title: string }) {
  return (
    <div className={styles.root}>
      <div className={styles.tag}>интерактив</div>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.note}>Страница-заглушка — наполнение появится позже.</p>
    </div>
  )
}
