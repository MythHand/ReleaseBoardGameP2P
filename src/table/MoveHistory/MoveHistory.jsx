import styles from './MoveHistory.module.css'

function Row({ e, nested = false }) {
  const accent = e.cat ? `var(--cat-${e.cat})` : undefined
  const label = e.card ?? e.kind ?? e.text
  return (
    <>
      <div
        className={`${styles.row} ${nested ? styles.nested : ''}`}
        data-accented={accent ? 'true' : 'false'}
        style={accent ? { '--accent': accent } : undefined}
      >
        <span className={e.card ? styles.card : styles.action}>{label}</span>
        <span className={styles.who}>{e.who}</span>
      </div>
      {e.children?.map((c) => (
        <Row key={c.id} e={c} nested />
      ))}
    </>
  )
}

// История: слева — название карты/действия, справа — кто сделал;
// атаки/защиты по релизу вложены; слева фон-градиент из цвета типа карты.
export default function MoveHistory({ entries = [] }) {
  return (
    <div className={styles.box}>
      <div className={styles.title}>история ходов</div>
      <div className={styles.list}>
        {entries.map((e) => (
          <Row key={e.id} e={e} />
        ))}
      </div>
    </div>
  )
}
