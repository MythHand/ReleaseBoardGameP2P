import { useTranslation } from '@release/translation'
import { Button } from '@release/ui'
import { useParams } from 'react-router'
import { useSession } from '~/app/providers/SessionProvider'
import { useJoinLobby } from '~/features/join-lobby/useJoinLobby'
import Form, { FormField } from '~/shared/ui/Form'
import { card } from './_ui'

export default function JoinForm() {
  const { t } = useTranslation()
  const joinLobby = useJoinLobby()
  const connecting = useSession().status === 'connecting'
  const params = useParams()

  return (
    <Form
      className={`${card} flex flex-col gap-4`}
      onSubmit={(data) => {
        const name = data.name?.trim() ?? ''
        const code = data.code?.trim() ?? ''
        if (name && code && !connecting) joinLobby(code, name)
      }}
      requiredMessage={t('start.required')}
    >
      <h2 className="font-bold text-lg tracking-base">{t('lobby.joinTitle')}</h2>

      <FormField
        name="name"
        label={t('lobby.namePlaceholder')}
        placeholder={t('lobby.namePlaceholder')}
        maxLength={20}
        required
      />

      <FormField
        name="code"
        label={t('lobby.code')}
        defaultValue={params.lobbyId ?? ''}
        placeholder={t('lobby.codePlaceholder')}
        required
      />

      <Button type="submit" disabled={connecting}>
        {t('lobby.join')}
      </Button>
    </Form>
  )
}
