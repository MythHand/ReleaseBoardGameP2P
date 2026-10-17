import { readFileSync } from 'node:fs'

// THE GAME'S VERSION, for the builds of the apps that show it: the root
// package.json, which a release bumps before the deploy builds from its tag
// (.github/workflows/release.yml), so a deployed build always shows the version
// it was released as. One reading for every config that needs it — the app's,
// its tests' and the playground's — handed to the client through `define`,
// where it reads `import.meta.env.VITE_APP_VERSION`.
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  version: string
}

export const appVersionDefine = { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) }
