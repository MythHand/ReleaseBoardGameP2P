import { Navigate } from 'react-router'

// No landing screen — the app launches straight into the start screen.
// `/` redirects to `/start`, which is the real entry point.
export default function Index() {
  return <Navigate to="/start" replace />
}
