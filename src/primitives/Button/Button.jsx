import styles from './Button.module.css'

// Кнопка в стиле лоадера. variant:
//   primary — основная, брекеты [ TEXT ], моноширинный uppercase;
//   tech    — техническая, бордер-бокс (как audio-toggle лоадера).
export default function Button({ children, variant = 'primary', className = '', ...rest }) {
  const isPrimary = variant === 'primary'
  return (
    <button className={`${styles.btn} ${styles[variant]} ${className}`} type="button" {...rest}>
      {isPrimary && <span className={styles.bracket}>[</span>}
      <span className={styles.label}>{children}</span>
      {isPrimary && <span className={styles.bracket}>]</span>}
    </button>
  )
}
