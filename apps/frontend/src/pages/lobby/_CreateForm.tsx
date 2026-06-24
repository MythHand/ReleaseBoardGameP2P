import { useTranslation } from '@release/translation'
import type { Setup } from '@release/ui'
import {
  Button,
  DEFAULT_SETUP,
  GAME_MODES,
  MODES_COPY_EN,
  MODES_COPY_RU,
  ModeSelect,
} from '@release/ui'
import { useState } from 'react'
import { useSession } from '~/app/providers/SessionProvider'
import { useCreateLobby } from '~/features/create-lobby/useCreateLobby'
import Form, { FormField } from '~/shared/ui/Form'
import { card, field, input, label, MAX_PLAYER_OPTIONS } from './_ui'

export default function CreateForm() {
  const { t, i18n } = useTranslation()
  const modesCopy = i18n.language.startsWith('en') ? MODES_COPY_EN : MODES_COPY_RU
  const createLobby = useCreateLobby()
  const connecting = useSession().status === 'connecting'

  const [maxPlayers, setMaxPlayers] = useState(4)
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP)
  const setMode = (key: string, value: string) => setSetup((s) => ({ ...s, [key]: value }))

  return (
    <Form
      className={`${card} flex flex-col gap-4`}
      onSubmit={(data) => {
        const name = data.name?.trim() ?? ''
        if (name && !connecting) createLobby(name, maxPlayers)
      }}
      requiredMessage={t('start.required')}
    >
      <h2 className="font-bold text-lg tracking-base">{t('lobby.createTitle')}</h2>

      <FormField
        name="name"
        label={t('lobby.namePlaceholder')}
        placeholder={t('lobby.namePlaceholder')}
        maxLength={20}
        required
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
          {GAME_MODES.map((m) => {
            const mc = modesCopy[m.key]
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
                onChange={(v) => setMode(m.key, v)}
              />
            )
          })}
        </div>
      </details>

      <Button type="submit" disabled={connecting}>
        {t('lobby.create')}
      </Button>
    </Form>
  )
}
