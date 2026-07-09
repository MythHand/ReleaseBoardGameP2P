import { describe, expect, it } from 'vitest'
import { parseConfig } from './config.js'

describe('parseConfig', () => {
  it('applies defaults when env is empty', () => {
    expect(parseConfig({})).toEqual({ port: 9000, peerPath: '/', peerKey: 'peerjs' })
  })

  it('respects env overrides', () => {
    expect(parseConfig({ PORT: '8080', PEER_PATH: '/signal', PEER_KEY: 'secret' })).toEqual({
      port: 8080,
      peerPath: '/signal',
      peerKey: 'secret',
    })
  })

  it('rejects a non-numeric PORT', () => {
    expect(() => parseConfig({ PORT: 'abc' })).toThrow('Invalid PORT')
  })

  it('rejects an out-of-range PORT', () => {
    expect(() => parseConfig({ PORT: '70000' })).toThrow('Invalid PORT')
  })
})
