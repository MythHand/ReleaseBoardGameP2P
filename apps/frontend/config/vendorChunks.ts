export function vendorChunk(id: string): string | undefined {
  // Keep feature imports independent of the bootstrap's changing chunk URLs.
  if (id.endsWith('/apps/frontend/src/pages/start.tsx')) return 'start-screen'
  if (/\/apps\/frontend\/src\/shared\/lib\/(sessionPersistence|storage)\.ts$/.test(id))
    return 'session-context'
  if (
    /\/apps\/frontend\/src\/app\/providers\/(SessionProvider|SessionGate|sessionStore)\.tsx?$/.test(
      id,
    )
  )
    return 'session-context'
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
