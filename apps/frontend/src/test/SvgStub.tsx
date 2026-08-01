import type { SVGProps } from 'react'

// `*.svg?react` imports resolve to React components at build time via
// vite-plugin-svgr. Under vitest that plugin fights the Vite version vitest
// brings, and without it the import resolves to the asset URL *string*, which
// React then uses as an element name — `InvalidCharacterError`, thrown the
// moment a real card renders its category icon. Aliasing to a stub keeps the
// import shape honest without pulling the plugin into the test runtime.
export default function SvgStub(props: SVGProps<SVGSVGElement>) {
  return <svg {...props} />
}
