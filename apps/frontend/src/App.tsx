import { Route, Routes } from 'react-router'
import LanguageSwitch from './components/LanguageSwitch'
import HomeScreen from './screens/HomeScreen'
import LobbyScreen from './screens/LobbyScreen'

export default function App() {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <LanguageSwitch />
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/lobby" element={<LobbyScreen />} />
      </Routes>
    </div>
  )
}
