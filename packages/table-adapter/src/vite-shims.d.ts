// @release/ui is consumed from source (its `exports` map points at `src/`), so
// typechecking this package pulls in ui modules that use Vite-only syntax —
// CSS Modules and `import.meta.glob` (the card catalogue's asset resolver).
// These are the minimal ambient shapes `vite/client` would otherwise provide;
// declared locally so this package does not need `vite` as a dependency just
// for its types.

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
declare module '*.css'

// Static asset imports the kit's source uses (card art, brand SVGs, boot
// audio) — string URL by default, `?raw` for inlined SVG markup, `?react`
// (declared below) for an SVG-as-component import via vite-plugin-svgr.
declare module '*.png' {
  const src: string
  export default src
}
declare module '*.svg' {
  const src: string
  export default src
}
declare module '*.svg?raw' {
  const src: string
  export default src
}
declare module '*.wav' {
  const src: string
  export default src
}
declare module '*.svg?react' {
  import type { FunctionComponent, SVGProps } from 'react'

  const ReactComponent: FunctionComponent<SVGProps<SVGSVGElement> & { title?: string }>
  export default ReactComponent
}

interface ImportMetaGlobOptions {
  eager?: boolean
  query?: string
  import?: string
}

interface ImportMeta {
  glob(pattern: string, options?: ImportMetaGlobOptions): Record<string, unknown>
}
