import { useTranslation } from '@release/translation'
import { DEFAULT_SETUP, GAME_MODES, type Setup } from '@release/ui'
import { useState } from 'react'
import { useSession } from '~/app/providers/SessionProvider'
import { useCreateLobby } from '~/features/create-lobby/useCreateLobby'
import { card, field, input, label, MAX_PLAYER_OPTIONS, primaryBtn } from './_ui'

// Host form: create a room. Match modes are prototype-only (shown but not yet
// carried in the lobby protocol — createRoom takes name + maxPlayers).
export default function CreateForm() {
  const { t } = useTranslation()
  const createLobby = useCreateLobby()
  const connecting = useSession().status === 'connecting'

  const [name, setName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP)

  const canCreate = name.trim().length > 0 && !connecting

  return (
    <form
      className={`${card} flex flex-col gap-4`}
      onSubmit={(e) => {
        e.preventDefault()
        if (canCreate) createLobby(name.trim(), maxPlayers)
      }}
    >
      <h2 className="font-bold text-lg tracking-base">{t('lobby.createTitle')}</h2>
      <label className={field}>
        <span className={label}>{t('lobby.namePlaceholder')}</span>
        <input
          className={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('lobby.namePlaceholder')}
          maxLength={20}
        />
      </label>
      <label className={field}>
        <span className={label}>{t('lobby.maxPlayers')}</span>
        <select
          className={input}
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
        >
          {MAX_PLAYER_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <details className="text-sm">
        <summary className={`${label} cursor-pointer`}>{t('lobby.modes')}</summary>
        <div className="mt-3 flex flex-col gap-3">
          {GAME_MODES.map((gameMode) => (
            <label key={gameMode.key} className={field}>
              <span className="text-fg/60 text-xs">{gameMode.title}</span>
              <select
                className={input}
                value={setup[gameMode.key] ?? ''}
                onChange={(e) => setSetup((s) => ({ ...s, [gameMode.key]: e.target.value }))}
              >
                {gameMode.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </details>

      <button type="submit" className={primaryBtn} disabled={!canCreate}>
        {t('lobby.create')}
      </button>
    </form>
  )
}
