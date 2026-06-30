import { Navigate } from 'react-router'

export default function NotFound() {
  return <Navigate to="/start" replace />
}
