// Game favicon set (shared across all entry points). The glob yields
// base-path-correct (hashed) asset URLs and bundles into whichever app
// imports this module.
const icons = import.meta.glob('./favicons/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

export const faviconUrls = Object.values(icons) as string[]

// Sets a random favicon from the set — one per page load. Idempotently
// updates the existing <link rel="icon"> or creates it.
export function setRandomFavicon(): void {
  if (faviconUrls.length === 0) return
  const url = faviconUrls[Math.floor(Math.random() * faviconUrls.length)]
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = url
}
