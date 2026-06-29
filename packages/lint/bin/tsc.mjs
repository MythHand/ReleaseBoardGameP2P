#!/usr/bin/env node
// Thin wrapper exposing this package's TypeScript compiler as `release-tsc`,
// so consumers depend on @release/lint instead of installing typescript.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const pkgDir = dirname(require.resolve('typescript/package.json'))
const { bin } = require('typescript/package.json')
const tsc = join(pkgDir, typeof bin === 'string' ? bin : bin.tsc)

const { status } = spawnSync(process.execPath, [tsc, ...process.argv.slice(2)], {
  stdio: 'inherit',
})
process.exit(status ?? 1)
