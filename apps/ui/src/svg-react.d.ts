// `*.svg?react` imports resolve to a React component (via vite-plugin-svgr in
// the consuming app). @release/ui is consumed from source, so its own tsc needs
// this ambient declaration to type the CardParallax category-icon imports.
declare module '*.svg?react' {
  import type { FunctionComponent, SVGProps } from 'react'

  const ReactComponent: FunctionComponent<SVGProps<SVGSVGElement> & { title?: string }>
  export default ReactComponent
}
