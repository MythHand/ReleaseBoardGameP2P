import { useTranslation } from '@release/translation'
import CreateLobbyForm from '~/features/create-lobby/CreateLobbyForm'
import JoinLobbyForm from '~/features/join-lobby/JoinLobbyForm'
import Rules from '~/features/rules/Rules'
import ModalRouter from '~/shared/ui/ModalRouter'

export default function AppModals() {
  const { t } = useTranslation()
  return (
    <ModalRouter
      routes={{
        create: { title: t('start.createTitle'), wide: true, children: <CreateLobbyForm /> },
        join: { title: t('start.joinTitle'), children: <JoinLobbyForm /> },
        rules: { title: t('start.rulesTitle'), children: <Rules /> },
      }}
    />
  )
}
