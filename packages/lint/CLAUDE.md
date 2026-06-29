# @release/lint

Shared tooling for the monorepo: one package that owns the Biome, stylelint, and
TypeScript configuration **and** the tool binaries. Every other package depends on
`@release/lint` instead of installing `@biomejs/biome`, `typescript`, or the
stylelint configs itself.

## Contents

| File | What it is |
|------|-----------|
| `biome.json` | Base Biome config (lint rules, formatter, assist). `"root": false`. |
| `stylelint.config.json` | Base stylelint config. |
| `tsconfig.json` | Base TS compiler options (was the repo-root `tsconfig.base.json`). |
| `no-untranslated.grit` | GritQL plugin: flags untranslated JSX text / string literals. |
| `bin/tsc.mjs` → `release-tsc` | Wrapper over the bundled `typescript`. |
| `bin/lint.mjs` → `release-lint` | Wrapper over the bundled `biome` (args forwarded verbatim). |

## How consumers use it

- **Biome** — repo-root `biome.json`: `"extends": ["@release/lint/biome"]`
- **stylelint** — repo-root `.stylelintrc.json`: `"extends": ["@release/lint/stylelint"]`
- **TypeScript** — each package `tsconfig.json`: `"extends": "@release/lint/tsconfig"`
- **Scripts** — `typecheck` → `release-tsc --noEmit -p tsconfig.json`; root `lint`/`format`
  and `lint-staged` → `release-lint check|format …`

Adding a new package: depend on `@release/lint` (`workspace:*`), extend the three
configs, and use `release-tsc` / `release-lint` in its scripts. No direct tool deps.

## Gotchas (read before editing)

1. **The grit plugin is declared in the repo-root `biome.json`, not here.** Biome
   resolves a plugin `path` relative to the *root* config, not through `extends`
   (package-specifier and package-relative paths both fail to load). The `.grit`
   file lives in this package; the `plugins` block sits in the root config pointing
   at `./packages/lint/no-untranslated.grit`. Don't move the declaration back here.
2. **`"root": false` in `biome.json` is required.** Without it Biome treats this as a
   second root config and errors with "nested root configuration".
3. **Nursery rules must be listed explicitly.** The `recommended` preset never enables
   nursery-group rules, even ones whose metadata is flagged "recommended" (e.g.
   `noImpliedEval`). If it's in `nursery`, it's off unless listed.
4. **Don't re-list rules already in `recommended`** unless you're *raising* severity.
   `preset: "recommended"` already enables them. An explicit `"error"` only matters
   when it's stronger than the recommended default — notably to bump an `info`-default
   rule (e.g. `noUselessFragments`, `useShorthandFunctionType`) so `--error-on-warnings`
   blocks it.

## Working on rules

- Inspect any rule: `pnpm exec release-lint explain <ruleName>` (group, recommended
  status, default severity, options).
- After any config change, verify from the repo root:
  `pnpm lint && pnpm typecheck && pnpm test`.
