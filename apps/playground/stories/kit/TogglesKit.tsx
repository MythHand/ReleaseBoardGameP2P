import { useState } from 'react'
import { GAME_MODES, MODES_COPY_RU } from '@/game/modes'
import ModeSelect from '@/primitives/ModeSelect'
import Toggle from '@/primitives/Toggle'
import { KitCell, KitPage, KitSection } from './KitShell'
import styles from './TogglesKit.module.css'

// демо-режим: структура GAME_MODES[0] + русский текст из словаря
const SAMPLE = GAME_MODES[0]
const SAMPLE_COPY = MODES_COPY_RU[SAMPLE.key]
const SAMPLE_OPTIONS = SAMPLE.options.map((o) => ({
  value: o.value,
  label: o.label,
  desc: SAMPLE_COPY?.options[o.value] ?? '',
}))
const SAMPLE_TITLE = SAMPLE_COPY?.title ?? ''

// Переключатели: сегментированный ModeSelect и бинарный Toggle (реальные примитивы).
export default function TogglesKit() {
  const [value, setValue] = useState(SAMPLE.options[0]?.value ?? '')
  const [ready, setReady] = useState(false)

  return (
    <KitPage title="Toggles">
      <KitSection title="ModeSelect — сегментированный выбор с ползунком">
        <div className={styles.wide}>
          <ModeSelect
            title={SAMPLE_TITLE}
            options={SAMPLE_OPTIONS}
            value={value}
            onChange={setValue}
          />
        </div>
      </KitSection>

      <KitSection title="ModeSelect — read-only (как у гостя)">
        <div className={styles.wide}>
          <ModeSelect title={SAMPLE_TITLE} options={SAMPLE_OPTIONS} value={value} readOnly />
        </div>
      </KitSection>

      <KitSection title="Toggle — бинарный (готовность)">
        <KitCell caption={ready ? 'on' : 'off'}>
          <Toggle on={ready} onChange={setReady}>
            {ready ? 'готов' : 'не готов'}
          </Toggle>
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
