export function copyText(text: string): Promise<boolean> {
  if (!text.trim() || !navigator.clipboard?.writeText) return Promise.resolve(false)
  return navigator.clipboard.writeText(text).then(
    () => true,
    () => false,
  )
}
