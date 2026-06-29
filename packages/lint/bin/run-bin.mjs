// Shared launcher for the package's thin bin wrappers: resolve a dependency's
// own bin and spawn it, forwarding argv verbatim, then exit with its status.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

export function runBin(pkg, binKey) {
  const pkgDir = dirname(require.resolve(`${pkg}/package.json`))
  const { bin } = require(`${pkg}/package.json`)
  const binPath = join(pkgDir, typeof bin === 'string' ? bin : bin[binKey])
  const { status } = spawnSync(process.execPath, [binPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
  })
  process.exit(status ?? 1)
}
