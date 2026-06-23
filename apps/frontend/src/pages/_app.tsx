import { Outlet } from 'react-router'
import { SessionProvider } from '~/app/providers/SessionProvider'
import LanguageSwitch from '~/shared/ui/LanguageSwitch'

export default function App() {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-bg text-fg">
        <LanguageSwitch />
        <Outlet />
      </div>
    </SessionProvider>
  )
}
