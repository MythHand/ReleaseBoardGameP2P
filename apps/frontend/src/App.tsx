import LanguageSwitch from './components/LanguageSwitch'
import LobbyScreen from './screens/LobbyScreen'

export default function App() {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <LanguageSwitch />
      <LobbyScreen />
    </div>
  )
}
