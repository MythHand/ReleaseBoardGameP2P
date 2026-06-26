// Случайная фавиконка из набора при каждой загрузке страницы.
// Глоб даёт base-path-корректные (захешированные) URL ассетов.
const icons = import.meta.glob('./assets/favicons/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

const urls = Object.values(icons) as string[]

if (urls.length > 0) {
  const url = urls[Math.floor(Math.random() * urls.length)]
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = url
}
