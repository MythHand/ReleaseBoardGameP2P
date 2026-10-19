import { useTranslation } from '@release/translation'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { createModuleResource } from '~/shared/lib/moduleResource'
import DeferredContent from '~/shared/ui/DeferredContent'
import ModalRouter from '~/shared/ui/ModalRouter'
import SessionGate from './providers/SessionGate'

const create = createModuleResource(() => import('~/features/create-lobby/CreateLobbyForm'))
const join = createModuleResource(() => import('~/features/join-lobby/JoinLobbyForm'))
const rules = createModuleResource(() => import('~/features/rules/Rules'))

export default function AppModals() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const active = params.get('modal')
  const [rulesReady, setRulesReady] = useState(false)
  const onRulesReady = useCallback(() => setRulesReady(true), [])
  useEffect(() => {
    if (active !== 'rules') setRulesReady(false)
  }, [active])
  return (
    <ModalRouter
      routes={{
        create: {
          title: t('start.createTitle'),
          wide: true,
          children: (
            <SessionGate>
              <DeferredContent resource={create}>{({ default: Form }) => <Form />}</DeferredContent>
            </SessionGate>
          ),
        },
        join: {
          title: t('start.joinTitle'),
          children: (
            <SessionGate>
              <DeferredContent resource={join}>{({ default: Form }) => <Form />}</DeferredContent>
            </SessionGate>
          ),
        },
        // a search filters the rules: the modal keeps the height it opened at
        rules: {
          title: t('start.rulesTitle'),
          wide: true,
          children: (
            <DeferredContent resource={rules}>
              {({ default: Rules }) => <Rules onReady={onRulesReady} />}
            </DeferredContent>
          ),
          holdHeight: rulesReady,
        },
      }}
    />
  )
}
