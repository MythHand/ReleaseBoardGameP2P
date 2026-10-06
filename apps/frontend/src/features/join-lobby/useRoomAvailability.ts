import { useEffect, useRef, useState } from 'react'
import { checkRoom, type JoinAvailability } from '~/network'

interface Result {
  code: string
  availability: JoinAvailability | null
  state: 'ok' | 'checking' | 'error'
}

export function useRoomAvailability(code: string) {
  const [result, setResult] = useState<Result>({ code, availability: null, state: 'ok' })
  const request = useRef<AbortController | null>(null)
  useEffect(() => {
    setResult({ code, availability: null, state: 'ok' })
    return () => {
      request.current?.abort()
      request.current = null
    }
  }, [code])
  const reset = () => {
    request.current?.abort()
    request.current = null
    setResult({ code, availability: null, state: 'ok' })
  }
  const check = async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setResult({ code, availability: null, state: 'checking' })
    try {
      const availability = await checkRoom(code, controller.signal)
      if (request.current !== controller) return
      setResult({ code, availability, state: 'ok' })
    } catch {
      if (request.current !== controller || controller.signal.aborted) return
      setResult({ code, availability: null, state: 'error' })
    }
  }
  return {
    availability: result.code === code ? result.availability : null,
    codeState: result.code === code ? result.state : 'ok',
    check,
    reset,
  }
}
