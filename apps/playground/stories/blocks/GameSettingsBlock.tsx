import { useState } from 'react'
import GameSettings from '@/blocks/GameSettings'
import { DEFAULT_SETUP, MODES_COPY_EN, MODES_COPY_RU, type Setup } from '@/game/modes'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'

// A ready piece: the real GameSettings component (same as in Start/Lobby/Table).
// The story holds the state; mode copy follows the language toggle.
export default function GameSettingsBlock() {
  const { lang } = useLang()
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP)
  const setMode = (key: string, value: string) => setSetup((s) => ({ ...s, [key]: value }))

  return (
    <KitPage title="Game settings" tag="block">
      <KitSection title={pick(lang, { ru: 'Настройка режимов партии', en: 'Match mode setup' })}>
        <div style={{ inlineSize: 560 }}>
          <GameSettings
            setup={setup}
            onChange={setMode}
            copy={pick(lang, { ru: MODES_COPY_RU, en: MODES_COPY_EN })}
          />
        </div>
      </KitSection>
    </KitPage>
  )
}
