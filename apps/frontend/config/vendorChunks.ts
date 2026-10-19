export function vendorChunk(id: string): string | undefined {
  const packageName = id.replaceAll('\\', '/').split('/node_modules/').at(-1)?.split('/')[0]
  if (!id.includes('/node_modules/')) return undefined
  if (packageName && ['react', 'react-dom', 'scheduler'].includes(packageName))
    return 'vendor-react'
  if (packageName === 'react-router') return 'vendor-router'
  if (
    packageName &&
    ['i18next', 'react-i18next', 'i18next-browser-languagedetector'].includes(packageName)
  )
    return 'vendor-i18n'
  if (packageName === 'peerjs') return 'vendor-peer'
  return undefined
}
