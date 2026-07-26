import { useTranslation } from '@release/translation'
import {
  Button,
  DEFAULT_SETUP,
  GAME_MODES,
  type GameModesCopy,
  ModeSelect,
  randomNickname,
  type Setup,
  sanitizeNickname,
  Typography,
} from '@release/ui'
import { useState } from 'react'
import DiceIcon from '@/icons/DiceIcon'
import { useGoToLobby } from '~/app/lib/lobbyNavigation'
import { useSession } from '~/app/providers/SessionProvider'
import Form, { FormField } from '~/shared/ui/Form'
import styles from './CreateLobbyForm.module.css'
import { useCreateLobby } from './useCreateLobby'

// Default lobby capacity: the maximum the host can later narrow with the
// in-lobby slider. Seeding the max means early joiners are always admitted as
// players, never silently relegated to spectators.
const DEFAULT_CAPACITY = 6

export default function CreateLobbyForm() {
  const { t } = useTranslation()
  // mode copy comes from the central catalog (namespace `gameModes`) via i18next
  const modesCopy: GameModesCopy = t('gameModes', { returnObjects: true })
  const goToLobby = useGoToLobby()
  const createLobby = useCreateLobby()
  const session = useSession()
  const connecting = session.status === 'connecting'
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP)
  const [name, setName] = useState('')

  return (
    <Form
      onSubmit={async (data) => {
        const nickname = sanitizeNickname(data.name ?? '').trim()
        if (nickname && !connecting) {
          try {
            // Pass the host's mode picks so the lobby seeds them instead of
            // DEFAULT_SETUP. A setup failure rejects here and is surfaced via
            // session.error below, so only navigate on success.
            const code = await createLobby(nickname, DEFAULT_CAPACITY, setup)
            goToLobby(code)
          } catch {
            // Error already surfaced through session.error; stay on the form.
          }
        }
      }}
      requiredMessage={t('start.required')}
    >
      <div className={styles.createGrid}>
        <div className={styles.createMods}>
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
                onChange={(v) => setSetup((s) => ({ ...s, [m.key]: v }))}
              />
            )
          })}
        </div>
        <div className={styles.createTech}>
          <Typography variant="panelTitle" as="h4" className={styles.techTitle}>
            {t('start.lobbyParams')}
          </Typography>
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
          {session.error && (
            <Typography base="body" as="p" className={styles.error}>
              {session.error}
            </Typography>
          )}
          <Typography variant="footnote" className={styles.note}>
            {t('start.lobbyNote')}
          </Typography>
        </div>
      </div>
    </Form>
  )
}
