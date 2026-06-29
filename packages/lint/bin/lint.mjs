#!/usr/bin/env node
// Thin wrapper exposing this package's Biome as `release-lint`, so consumers
// depend on @release/lint instead of installing @biomejs/biome. Arguments are
// forwarded verbatim, e.g. `release-lint check .` or `release-lint format --write .`.
import { runBin } from './run-bin.mjs'

runBin('@biomejs/biome', 'biome')
