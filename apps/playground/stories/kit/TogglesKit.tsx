import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { useState } from 'react'
import { GAME_MODES, type GameModesCopy } from '@/game/modes'
import ModeSelect from '@/primitives/ModeSelect'
import Toggle from '@/primitives/Toggle'
import { useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from './KitShell'
import styles from './TogglesKit.module.css'

// demo mode: GAME_MODES[0] structure + copy from the language dictionary
const SAMPLE = GAME_MODES[0]

// the small size as the table's action time uses it
const SCALES = [
  { value: '1', label: '1x' },
  { value: '2', label: '2x' },
  { value: '3', label: '3x' },
]

const COPY = {
  ru: {
    segmented: 'ModeSelect — сегментированный выбор с ползунком',
    readOnly: 'ModeSelect — read-only (как у гостя)',
    small: 'ModeSelect size="sm" — строка настроек, высотой с Toggle',
    toggle: 'Toggle — бинарный (готовность)',
    ready: 'готов',
    notReady: 'не готов',
  },
  en: {
    segmented: 'ModeSelect — segmented choice with a thumb',
    readOnly: 'ModeSelect — read-only (as for a guest)',
    small: 'ModeSelect size="sm" — a settings row, as tall as a Toggle',
    toggle: 'Toggle — binary (readiness)',
    ready: 'ready',
    notReady: 'not ready',
  },
}

// Toggles: segmented ModeSelect and binary Toggle (real primitives).
export default function TogglesKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  const modes: GameModesCopy = lang === 'ru' ? ruCommon.gameModes : enCommon.gameModes
  const sampleCopy = modes[SAMPLE.key]
  const sampleTitle = sampleCopy?.title ?? ''
  const sampleOptions = SAMPLE.options.map((o) => ({
    value: o.value,
    label: o.label,
    desc: sampleCopy?.options[o.value] ?? '',
  }))

  const [value, setValue] = useState(SAMPLE.options[0]?.value ?? '')
  const [ready, setReady] = useState(false)
  const [scale, setScale] = useState('1')

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

      <KitSection title={t.small}>
        <KitCell caption="interactive">
          <ModeSelect size="sm" options={SCALES} value={scale} onChange={setScale} />
        </KitCell>
        <KitCell caption="read-only">
          <ModeSelect size="sm" options={SCALES} value={scale} readOnly />
        </KitCell>
        <KitCell caption="disabled">
          <ModeSelect size="sm" options={SCALES} value={scale} disabled />
        </KitCell>
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
