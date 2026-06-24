import { useTranslation } from '@release/translation'
import type { Setup } from '@release/ui'
import {
  Button,
  DEFAULT_SETUP,
  GameSettings,
  InputField,
  MODES_COPY_EN,
  MODES_COPY_RU,
} from '@release/ui'
import { useState } from 'react'
import { useSession } from '~/app/providers/SessionProvider'
import { useCreateLobby } from '~/features/create-lobby/useCreateLobby'
import { card, field, input, label, MAX_PLAYER_OPTIONS } from './_ui'

export default function CreateForm() {
  const { t, i18n } = useTranslation()
  const modesCopy = i18n.language.startsWith('en') ? MODES_COPY_EN : MODES_COPY_RU
  const createLobby = useCreateLobby()
  const connecting = useSession().status === 'connecting'

  const [name, setName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP)
  const setMode = (key: string, value: string) => setSetup((s) => ({ ...s, [key]: value }))

  const canCreate = name.trim().length > 0 && !connecting
  const create = () => {
    if (canCreate) createLobby(name.trim(), maxPlayers)
  }

  return (
    <form
      className={`${card} flex flex-col gap-4`}
      onSubmit={(e) => {
        e.preventDefault()
        create()
      }}
    >
      <h2 className="font-bold text-lg tracking-base">{t('lobby.createTitle')}</h2>

      <InputField
        label={t('lobby.namePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('lobby.namePlaceholder')}
        maxLength={20}
      />

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
          <GameSettings setup={setup} onChange={setMode} copy={modesCopy} />
        </div>
      </details>

      <Button type="submit" disabled={!canCreate}>
        {t('lobby.create')}
      </Button>
    </form>
  )
}
