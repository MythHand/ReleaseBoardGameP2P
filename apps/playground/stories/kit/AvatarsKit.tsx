import { useState } from 'react'
import PresetAvatar, { PRESET_AVATARS } from '@/avatars/PresetAvatar'
import Avatar from '@/primitives/Avatar'
import { pick, useLang } from '../../Playground/lang'
import styles from './AvatarsKit.module.css'
import { KitCell, KitPage, KitSection } from './KitShell'

// The real Avatar primitive — initials + a muted look, plus the preset (card-art)
// avatars: a 128px gallery on the left, a live preview of the picked one at the
// real usage sizes (colour + muted) on the right.
const COPY = {
  ru: {
    sizes: 'Размеры (size в px)',
    muted: 'Приглушённый (не в сети)',
    presets: 'Пресеты',
    color: 'цвет',
    off: 'muted',
  },
  en: {
    sizes: 'Sizes (size in px)',
    muted: 'Muted (offline)',
    presets: 'Presets',
    color: 'color',
    off: 'muted',
  },
}

// real avatar sizes across the screens
const USAGE = [
  { size: 28, at: 'participants' },
  { size: 30, at: 'stats' },
  { size: 34, at: 'lobby' },
]

export default function AvatarsKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  const [sel, setSel] = useState(PRESET_AVATARS[0]?.id ?? '')

  return (
    <KitPage title="Avatars">
      <KitSection title={t.sizes}>
        <KitCell caption="28 · participants">
          <Avatar name="dimbo" size={28} />
        </KitCell>
        <KitCell caption="30 · stats">
          <Avatar name="neo" size={30} />
        </KitCell>
        <KitCell caption="34 · lobby">
          <Avatar name="trinity" size={34} />
        </KitCell>
      </KitSection>

      <KitSection title={t.muted}>
        <KitCell caption="muted">
          <Avatar name="morpheus" size={34} muted />
        </KitCell>
      </KitSection>

      <section className={styles.presets}>
        <h2 className={styles.h}>{t.presets}</h2>
        <div className={styles.split}>
          <div className={styles.gallery}>
            {PRESET_AVATARS.map((p) => (
              <button
                type="button"
                key={p.id}
                className={p.id === sel ? styles.itemOn : styles.item}
                onClick={() => setSel(p.id)}
              >
                <PresetAvatar id={p.id} size={128} />
                <span className={styles.cap}>{pick(lang, p.label)}</span>
              </button>
            ))}
          </div>

          <div className={styles.preview}>
            {USAGE.map((u) => (
              <div key={u.size} className={styles.previewRow}>
                <span className={styles.previewCap}>
                  {u.size} · {u.at}
                </span>
                <div className={styles.variants}>
                  <div className={styles.variant}>
                    <PresetAvatar id={sel} size={u.size} />
                    <span className={styles.sub}>{t.color}</span>
                  </div>
                  <div className={styles.variant}>
                    <PresetAvatar id={sel} size={u.size} muted />
                    <span className={styles.sub}>{t.off}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </KitPage>
  )
}
