import { Outlet } from 'react-router'
import LanguageSwitch from '~/shared/ui/LanguageSwitch'

export default function App() {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <LanguageSwitch />
      <Outlet />
    </div>
  )
}
