#!/usr/bin/env node
// Thin wrapper exposing this package's TypeScript compiler as `release-tsc`,
// so consumers depend on @release/lint instead of installing typescript.
import { runBin } from './run-bin.mjs'

runBin('typescript', 'tsc')
