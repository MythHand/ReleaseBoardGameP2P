import { useEffect, useRef } from 'react'
import { type PresentationId, samePresentation } from '~/network/session/presentationGate'

// Passive effect: the board's layout effects have already incorporated the
// batch, and the live projection has committed before readiness goes on wire.
export function usePresentationAck(args: {
  presentation?: PresentationId
  settled: boolean
  onReady?: (id: PresentationId) => void
}): void {
  const sent = useRef<PresentationId | null>(null)
  const { presentation, settled, onReady } = args
  useEffect(() => {
    if (!settled || !presentation || !onReady) return
    if (sent.current && samePresentation(sent.current, presentation)) return
    sent.current = presentation
    onReady(presentation)
  }, [presentation, settled, onReady])
}
