import { GAME_MODES, type GameModesCopy, type Setup } from '@/game/modes'
import ModeSelect from '@/primitives/ModeSelect'

interface GameSettingsProps {
  // переводимый текст режимов (title + описания опций); язык выбирает место использования
  copy: GameModesCopy
  setup?: Setup
  onChange?: (key: string, value: string) => void
  readOnly?: boolean
}

// Набор тоглов настроек игры. Структура (GAME_MODES) одна, текст приходит пропсом —
// i18n-agnostic. Управляемый: setup/onChange принадлежат экрану.
// Рендерит только список ModeSelect — контейнер и отступы остаются за местом использования.
export default function GameSettings({
  copy,
  setup = {},
  onChange,
  readOnly = false,
}: GameSettingsProps) {
  return (
    <>
      {GAME_MODES.map((m) => {
        const mc = copy[m.key]
        return (
          <ModeSelect
            key={m.key}
            title={mc?.title ?? ''}
            options={m.options.map((o) => ({
              value: o.value,
              label: o.label,
              desc: mc?.options[o.value] ?? '',
            }))}
            value={setup[m.key] ?? ''}
            onChange={(v) => onChange?.(m.key, v)}
            readOnly={readOnly}
          />
        )
      })}
    </>
  )
}
