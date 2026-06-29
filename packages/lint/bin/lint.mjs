#!/usr/bin/env node
// Thin wrapper exposing this package's Biome as `release-lint`, so consumers
// depend on @release/lint instead of installing @biomejs/biome. Arguments are
// forwarded verbatim, e.g. `release-lint check .` or `release-lint format --write .`.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const pkgDir = dirname(require.resolve('@biomejs/biome/package.json'))
const { bin } = require('@biomejs/biome/package.json')
const biome = join(pkgDir, typeof bin === 'string' ? bin : bin.biome)

const { status } = spawnSync(process.execPath, [biome, ...process.argv.slice(2)], {
  stdio: 'inherit',
})
process.exit(status ?? 1)
