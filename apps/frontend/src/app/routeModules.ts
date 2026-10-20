import { createModuleResource } from '~/shared/lib/moduleResource'
import type { PageModule } from './buildRoutes'

const loaders = import.meta.glob<PageModule>([
  '/src/pages/**/[A-Za-z0-9[-]*.{jsx,tsx,mdx}',
  '/src/pages/**/_layout.{jsx,tsx,mdx}',
  '!/src/pages/{index,start,404}.{jsx,tsx,mdx}',
  '!/src/pages/**/_*/**',
  '!/src/pages/**/*.{test,spec}.{jsx,tsx,mdx}',
])

export const deferredPages = Object.fromEntries(
  Object.entries(loaders).map(([key, load]) => [key, createModuleResource(load)]),
)

export async function preloadBoard(): Promise<void> {
  await deferredPages['/src/pages/board/[gameId]/index.tsx']?.load()
}
