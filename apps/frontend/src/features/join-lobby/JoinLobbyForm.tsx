import { useTranslation } from '@release/translation'
import { Button, randomNickname, sanitizeNickname } from '@release/ui'
import { useState } from 'react'
import DiceIcon from '@/icons/DiceIcon'
import { useSession } from '~/app/providers/SessionProvider'
import { useNavigate } from '~/app/router'
import Form, { FormField } from '~/shared/ui/Form'
import { useJoinLobby } from './useJoinLobby'

export default function JoinLobbyForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const joinLobby = useJoinLobby()
  const connecting = useSession().status === 'connecting'
  const [name, setName] = useState('')

  return (
    <Form
      onSubmit={(data) => {
        // parseRoomCode normalizes the code (strips separators/casing/spaces),
        // so the raw code is passed through; only the nickname needs cleaning.
        const name = sanitizeNickname(data.name ?? '').trim()
        const code = data.code ?? ''
        if (name && code.trim() && !connecting) {
          joinLobby(code, name)
          navigate('/lobby')
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
        placeholder={t('start.gameCodePlaceholder')}
        required
      />
      <Button type="submit" disabled={connecting}>
        {t('start.joinCta')}
      </Button>
    </Form>
  )
}
