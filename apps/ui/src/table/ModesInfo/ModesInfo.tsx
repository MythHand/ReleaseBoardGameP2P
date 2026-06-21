import styles from './ModesInfo.module.css'

export interface GameMode {
  label: string
  options: string[]
  active: string
}

interface ModesInfoProps {
  modes?: GameMode[]
}

// Просмотр выбранных режимов партии (выбраны хостом до старта) — read-only.
// Структура: строка-категория + ряд вариантов, активный подсвечен.
export default function ModesInfo({ modes = [] }: ModesInfoProps) {
  return (
    <div className={styles.box}>
      <div className={styles.title}>настройки партии</div>
      <div className={styles.list}>
        {modes.map((m) => (
          <div key={m.label} className={styles.group}>
            <div className={styles.label}>{m.label}</div>
            <div className={styles.options}>
              {m.options.map((opt) => (
                <span
                  key={opt}
                  className={opt === m.active ? styles.optOn : styles.opt}
                >
                  {opt}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
