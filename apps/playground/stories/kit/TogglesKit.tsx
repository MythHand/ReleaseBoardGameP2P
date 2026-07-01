import { useState } from 'react'
import { GAME_MODES, MODES_COPY_EN, MODES_COPY_RU } from '@/game/modes'
import ModeSelect from '@/primitives/ModeSelect'
import Toggle from '@/primitives/Toggle'
import { useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from './KitShell'
import styles from './TogglesKit.module.css'

// demo mode: GAME_MODES[0] structure + copy from the language dictionary
const SAMPLE = GAME_MODES[0]

const COPY = {
  ru: {
    segmented: 'ModeSelect — сегментированный выбор с ползунком',
    readOnly: 'ModeSelect — read-only (как у гостя)',
    toggle: 'Toggle — бинарный (готовность)',
    ready: 'готов',
    notReady: 'не готов',
  },
  en: {
    segmented: 'ModeSelect — segmented choice with a thumb',
    readOnly: 'ModeSelect — read-only (as for a guest)',
    toggle: 'Toggle — binary (readiness)',
    ready: 'ready',
    notReady: 'not ready',
  },
}

// Toggles: segmented ModeSelect and binary Toggle (real primitives).
export default function TogglesKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  const sampleCopy = (lang === 'ru' ? MODES_COPY_RU : MODES_COPY_EN)[SAMPLE.key]
  const sampleTitle = sampleCopy?.title ?? ''
  const sampleOptions = SAMPLE.options.map((o) => ({
    value: o.value,
    label: o.label,
    desc: sampleCopy?.options[o.value] ?? '',
  }))

  const [value, setValue] = useState(SAMPLE.options[0]?.value ?? '')
  const [ready, setReady] = useState(false)

  return (
    <KitPage title="Toggles">
      <KitSection title={t.segmented}>
        <div className={styles.wide}>
          <ModeSelect
            title={sampleTitle}
            options={sampleOptions}
            value={value}
            onChange={setValue}
          />
        </div>
      </KitSection>

      <KitSection title={t.readOnly}>
        <div className={styles.wide}>
          <ModeSelect title={sampleTitle} options={sampleOptions} value={value} readOnly />
        </div>
      </KitSection>

      <KitSection title={t.toggle}>
        <KitCell caption={ready ? 'on' : 'off'}>
          <Toggle on={ready} onChange={setReady}>
            {ready ? t.ready : t.notReady}
          </Toggle>
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
