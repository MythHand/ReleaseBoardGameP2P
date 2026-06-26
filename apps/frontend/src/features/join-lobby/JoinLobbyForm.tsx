import { useTranslation } from '@release/translation'
import { Button, randomNickname, sanitizeNickname } from '@release/ui'
import { useState } from 'react'
import { useParams } from 'react-router'
import DiceIcon from '@/icons/DiceIcon'
import { useGoToLobby } from '~/app/lib/lobbyNavigation'
import { useSession } from '~/app/providers/SessionProvider'
import Form, { FormField } from '~/shared/ui/Form'
import { useJoinLobby } from './useJoinLobby'

export default function JoinLobbyForm() {
  const { t } = useTranslation()
  const goToLobby = useGoToLobby()
  const joinLobby = useJoinLobby()
  const session = useSession()
  const connecting = session.status === 'connecting'
  const [name, setName] = useState('')
  // On an invite link (/lobby/:lobbyId) the code is in the URL; pre-fill it.
  // On the start-screen modal there is no route param, so this is empty.
  const { lobbyId } = useParams()

  return (
    <Form
      onSubmit={async (data) => {
        // parseRoomCode normalizes the code (strips separators/casing/spaces),
        // so the raw code is passed through; only the nickname needs cleaning.
        const name = sanitizeNickname(data.name ?? '').trim()
        const code = data.code ?? ''
        if (name && code.trim() && !connecting) {
          try {
            // A setup failure (bad code, signaling unreachable) rejects here and
            // is surfaced via session.error below, so only navigate on success.
            const formatted = await joinLobby(code, name)
            goToLobby(formatted)
          } catch {
            // Error already surfaced through session.error; stay on the form.
          }
        }
      }}
      requiredMessage={t('start.required')}
      className="flex flex-col gap-5"
    >
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
      <FormField
        name="code"
        label={t('start.gameCodeLabel')}
        defaultValue={lobbyId ?? ''}
        placeholder={t('start.gameCodePlaceholder')}
        required
      />
      <Button type="submit" disabled={connecting}>
        {t('start.joinCta')}
      </Button>
      {session.error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400 text-sm">
          {session.error}
        </p>
      )}
    </Form>
  )
}
