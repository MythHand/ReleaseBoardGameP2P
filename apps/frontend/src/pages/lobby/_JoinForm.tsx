import { useTranslation } from '@release/translation'
import { Button, Input } from '@release/ui'
import { useState } from 'react'
import { useParams } from 'react-router'
import { useSession } from '~/app/providers/SessionProvider'
import { useJoinLobby } from '~/features/join-lobby/useJoinLobby'
import { card } from './_ui'

// Guest form: connect to a room. The code is pre-filled from a shared
// `/lobby/:lobbyId` invite link when present.
export default function JoinForm() {
  const { t } = useTranslation()
  const joinLobby = useJoinLobby()
  const connecting = useSession().status === 'connecting'
  const params = useParams()

  const [name, setName] = useState('')
  const [code, setCode] = useState(params.lobbyId ?? '')

  const canJoin = name.trim().length > 0 && code.trim().length > 0 && !connecting
  const join = () => {
    if (canJoin) joinLobby(code.trim(), name.trim())
  }

  return (
    <form
      className={`${card} flex flex-col gap-4`}
      onSubmit={(e) => {
        e.preventDefault()
        join()
      }}
    >
      <h2 className="font-bold text-lg tracking-base">{t('lobby.joinTitle')}</h2>

      <Input
        label={t('lobby.namePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('lobby.namePlaceholder')}
        maxLength={20}
      />
      <Input
        label={t('lobby.code')}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t('lobby.codePlaceholder')}
      />

      <Button onClick={join} disabled={!canJoin}>
        {t('lobby.join')}
      </Button>
    </form>
  )
}
