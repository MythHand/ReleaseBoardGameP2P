import { useTranslation } from '@release/translation'
import { useState } from 'react'
import { useParams } from 'react-router'
import { useSession } from '~/app/providers/SessionProvider'
import { useJoinLobby } from '~/features/join-lobby/useJoinLobby'
import { card, field, input, label, primaryBtn } from './_ui'

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

  return (
    <form
      className={`${card} flex flex-col gap-4`}
      onSubmit={(e) => {
        e.preventDefault()
        if (canJoin) joinLobby(code.trim(), name.trim())
      }}
    >
      <h2 className="font-bold text-lg tracking-base">{t('lobby.joinTitle')}</h2>
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
        <span className={label}>{t('lobby.code')}</span>
        <input
          className={input}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('lobby.codePlaceholder')}
        />
      </label>
      <button type="submit" className={primaryBtn} disabled={!canJoin}>
        {t('lobby.join')}
      </button>
    </form>
  )
}
