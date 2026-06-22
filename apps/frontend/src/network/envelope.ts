import type { Message, WireMessage } from './types'

let seqCounter = 0

export function nextSeq(): number {
  seqCounter += 1
  return seqCounter
}

export function createEnvelope(message: Message, from: string, seq: number): WireMessage {
  return { ...message, from, seq } as WireMessage
}

export function parseEnvelope(raw: string): WireMessage {
  const obj = JSON.parse(raw) as unknown
  if (
    typeof obj !== 'object' ||
    obj === null ||
    typeof (obj as { type?: unknown }).type !== 'string' ||
    typeof (obj as { from?: unknown }).from !== 'string' ||
    typeof (obj as { seq?: unknown }).seq !== 'number'
  ) {
    throw new Error('Malformed wire message: missing type/from/seq')
  }
  return obj as WireMessage
}
