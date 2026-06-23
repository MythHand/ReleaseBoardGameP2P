import JoinForm from './_JoinForm'
import LobbyFlow from './_LobbyFlow'

// /lobby/:lobbyId — a shared invite link; guest lobby with the code pre-filled.
export default function JoinLobbyByCodePage() {
  return (
    <LobbyFlow>
      <JoinForm />
    </LobbyFlow>
  )
}
