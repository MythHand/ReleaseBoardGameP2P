import { useTranslation } from '@release/translation'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import CreateForm from './_CreateForm'
import JoinForm from './_JoinForm'
import LobbyFlow from './_LobbyFlow'

type Tab = 'create' | 'join'

const tabBtn = 'flex-1 rounded-md px-4 py-2 font-semibold text-sm tracking-base transition-colors'
const activeTab = `${tabBtn} bg-brand-green/12 text-brand-green`
const inactiveTab = `${tabBtn} text-fg/50 hover:text-fg/85`

// /lobby — host and guest in one place. The Create/Connect toggle picks the
// form; /start deep-links the initial tab via ?mode=create|join.
export default function LobbyIndexPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(searchParams.get('mode') === 'join' ? 'join' : 'create')

  return (
    <LobbyFlow>
      <div className="flex gap-1 rounded-lg border border-fg/10 bg-surface-1 p-1">
        <button
          type="button"
          className={tab === 'create' ? activeTab : inactiveTab}
          onClick={() => setTab('create')}
        >
          {t('lobby.create')}
        </button>
        <button
          type="button"
          className={tab === 'join' ? activeTab : inactiveTab}
          onClick={() => setTab('join')}
        >
          {t('lobby.join')}
        </button>
      </div>
      {tab === 'create' ? <CreateForm /> : <JoinForm />}
    </LobbyFlow>
  )
}
