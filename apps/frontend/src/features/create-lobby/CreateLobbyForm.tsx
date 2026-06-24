import { useTranslation } from '@release/translation'
import {
  Button,
  DEFAULT_SETUP,
  GAME_MODES,
  MODES_COPY_EN,
  MODES_COPY_RU,
  ModeSelect,
  randomNickname,
  type Setup,
  sanitizeNickname,
} from '@release/ui'
import { useState } from 'react'
import DiceIcon from '@/icons/DiceIcon'
import { useSession } from '~/app/providers/SessionProvider'
import { useNavigate } from '~/app/router'
import Form, { FormField } from '~/shared/ui/Form'
import { useCreateLobby } from './useCreateLobby'

export default function CreateLobbyForm() {
  const { t, i18n } = useTranslation()
  const modesCopy = i18n.language.startsWith('en') ? MODES_COPY_EN : MODES_COPY_RU
  const navigate = useNavigate()
  const createLobby = useCreateLobby()
  const connecting = useSession().status === 'connecting'
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP)
  const [name, setName] = useState('')

  return (
    <Form
      onSubmit={(data) => {
        const name = sanitizeNickname(data.name ?? '').trim()
        if (name && !connecting) {
          createLobby(name, 4)
          navigate('/lobby')
        }
      }}
      requiredMessage={t('start.required')}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] items-stretch">
        <div className="flex flex-col gap-6.5 pe-9">
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
                disabled
                onChange={(v) => setSetup((s) => ({ ...s, [m.key]: v }))}
              />
            )
          })}
        </div>
        <div className="flex flex-col gap-5 border-white/8 border-s ps-9">
          <h4 className="m-0 font-heading text-base text-white tracking-[0.02em]">
            {t('start.lobbyParams')}
          </h4>
          <FormField
            name="name"
            label={t('start.nicknameLabel')}
            placeholder={t('start.nicknamePlaceholder')}
            maxLength={20}
            required
            value={name}
            onChange={(e) => setName(sanitizeNickname(e.target.value))}
            trailing={
              <Button
                variant="icon"
                onClick={() => setName(randomNickname())}
                aria-label={t('start.randomNick')}
                title={t('start.randomNick')}
              >
                <DiceIcon />
              </Button>
            }
          />
          <Button type="submit" disabled={connecting}>
            {t('start.createCta')}
          </Button>
          <p className="mt-auto mb-0 text-[13px] text-white/50 leading-[1.55]">
            {t('start.lobbyNote')}
          </p>
        </div>
      </div>
    </Form>
  )
}
