import background from '@/assets/bug-runner/avatar-background.svg'
import bug from '@/assets/bug-runner/avatar-bug.svg'
import duck from '@/assets/bug-runner/avatar-duck.svg'
import hotfix from '@/assets/bug-runner/avatar-hotfix.svg'
import monitoring from '@/assets/bug-runner/avatar-monitoring.svg'
import server from '@/assets/bug-runner/avatar-server.svg'
import sudo from '@/assets/bug-runner/avatar-sudo.svg'

// The Bug Runner avatars: the mini-game's pixel art on black, as images. The
// same layers a card avatar has — background, dim, illustration — with no dim:
// the black is the background itself.
export interface AvatarLayers {
  background: string
  dim: number
  illustration: string
}

export const BUG_RUNNER_AVATARS: Record<string, AvatarLayers> = {
  'bug-runner-bug': { background, dim: 0, illustration: bug },
  'bug-runner-server': { background, dim: 0, illustration: server },
  'bug-runner-hotfix': { background, dim: 0, illustration: hotfix },
  'bug-runner-monitoring': { background, dim: 0, illustration: monitoring },
  'bug-runner-sudo': { background, dim: 0, illustration: sudo },
  'bug-runner-duck': { background, dim: 0, illustration: duck },
}
