import { generateRegularRoutes } from '@generouted/react-router/core'
import { type ComponentType, createElement, Suspense } from 'react'
import type { ActionFunction, LoaderFunction, RouteObject } from 'react-router'
import type { ModuleResource } from '~/shared/lib/moduleResource'

export interface PageModule {
  default: ComponentType
  // biome-ignore lint/style/useNamingConvention: generouted route module export.
  Catch?: ComponentType
  // biome-ignore lint/style/useNamingConvention: generouted route module export.
  Pending?: ComponentType
  // biome-ignore lint/style/useNamingConvention: generouted route module export.
  Loader?: LoaderFunction
  // biome-ignore lint/style/useNamingConvention: generouted route module export.
  Action?: ActionFunction
}

function pageProperties(module: PageModule) {
  const Page = module.default
  const Pending = module.Pending
  return {
    Component: Pending
      ? () => createElement(Suspense, { fallback: createElement(Pending) }, createElement(Page))
      : Page,
    ErrorBoundary: module.Catch,
    loader: module.Loader,
    action: module.Action,
  }
}

export function buildRoutes(
  eager: Record<string, PageModule>,
  deferred: Record<string, ModuleResource<PageModule>>,
  options: { requestSession(): Promise<void> },
): RouteObject[] {
  return generateRegularRoutes({ ...eager, ...deferred }, (_module, key) => {
    const index =
      /index\.(jsx|tsx|mdx)$/.test(key) && !key.includes('pages/index')
        ? { index: true as const }
        : {}
    if (eager[key]) return { ...index, ...pageProperties(eager[key]) }
    return {
      ...index,
      lazy: async () => {
        const [module] = await Promise.all([
          deferred[key].load(),
          /\/pages\/(lobby|board)\//.test(key) ? options.requestSession() : Promise.resolve(),
        ])
        return pageProperties(module)
      },
    }
  }) as RouteObject[]
}
