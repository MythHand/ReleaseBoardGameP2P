import type { PermissionInputs } from '../types'

export function microphone(
  browser: Pick<Navigator, 'mediaDevices'>,
  input: PermissionInputs['microphone'],
): Promise<MediaStream> {
  if (input.existing?.getAudioTracks().some((track) => track.readyState === 'live'))
    return Promise.resolve(input.existing)
  if (!browser.mediaDevices?.getUserMedia)
    throw new DOMException('Microphone API unavailable', 'NotSupportedError')
  return browser.mediaDevices.getUserMedia({ audio: input.constraints ?? true, video: false })
}
export function releaseMicrophone(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop()
}
