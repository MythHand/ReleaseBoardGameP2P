export function clipboard(browser: Pick<Navigator, 'clipboard'>, text: string): Promise<undefined> {
  if (!browser.clipboard?.writeText)
    throw new DOMException('Clipboard API unavailable', 'NotSupportedError')
  return browser.clipboard.writeText(text).then(() => undefined)
}
