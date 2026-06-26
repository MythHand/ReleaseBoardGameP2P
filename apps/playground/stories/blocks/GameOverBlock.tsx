import { type CSSProperties, useState } from 'react'
import Button from '@/primitives/Button'
import GameOver, {
  GAME_OVER_COPY_EN,
  GAME_OVER_COPY_RU,
  type GameOverCondition,
} from '@/table/GameOver/GameOver'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'

// Окно завершения партии (Overlay + карточка победителя). Текст — по языку,
// условие победы — переключателем.
const wrap: CSSProperties = { inlineSize: '100%' }
const controls: CSSProperties = { display: 'flex', gap: 12, marginBlockEnd: 12 }
const stage: CSSProperties = {
  position: 'relative',
  inlineSize: '100%',
  minBlockSize: 400,
  boxSizing: 'border-box',
  overflow: 'hidden',
  border: '1px solid rgb(255 255 255 / 12%)',
}
const filler: CSSProperties = {
  padding: 20,
  color: 'rgb(255 255 255 / 30%)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
}

export default function GameOverBlock() {
  const { lang } = useLang()
  const [condition, setCondition] = useState<GameOverCondition>('release')
  const copy = pick(lang, { ru: GAME_OVER_COPY_RU, en: GAME_OVER_COPY_EN })

  return (
    <KitPage title="Game over" tag="блок">
      <KitSection title="Окно завершения партии">
        <div style={wrap}>
          <div style={controls}>
            <Button
              variant="tech"
              onClick={() => setCondition((c) => (c === 'release' ? 'lastStanding' : 'release'))}
            >
              условие: {condition}
            </Button>
          </div>
          <div style={stage}>
            <div style={filler}>стол под окном</div>
            <GameOver
              winner={{ name: 'dimbo' }}
              condition={condition}
              onContinue={() => {}}
              copy={copy}
            />
          </div>
        </div>
      </KitSection>
    </KitPage>
  )
}
