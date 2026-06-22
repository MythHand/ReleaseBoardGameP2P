# Monorepo Restructure + 3-App Scaffold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the single-app JS/Vite repo into a pnpm-workspace monorepo with a shared TypeScript UI library and three apps (playground, frontend, backend), with Biome/Stylelint/Tailwind/Vitest tooling, react-i18next (en/ru), and onboarding docs.

**Architecture:** A pnpm workspace under `apps/*`. The existing `src/` visual layer becomes `@release/ui` (TS, CSS Modules + design tokens). `playground` and `frontend` are Vite+React apps that consume `@release/ui` through a source alias. `backend` is a Fastify + `ws` P2P **signaling** server (no game rules). Existing CSS Modules are preserved; Tailwind v4 (frontend only) themes off the design tokens via `@theme`. The UI library stays i18n-agnostic (text via props); react-i18next lives only in the frontend.

**Tech Stack:** pnpm workspaces, TypeScript 5, Vite 6, React 18, Biome 1.9 (TS/JS lint+format), Stylelint (CSS), Tailwind v4, Vitest, Fastify 5 + ws 8, react-i18next + i18next.

## Global Constraints

- **Branch:** all work lands on `migration/monorepo-scaffold`, never `main`.
- **Node:** 20+. **Package manager:** pnpm (declare `packageManager` in root).
- **Package scope:** `@release/*`. Packages: `@release/ui`, `@release/playground`, `@release/web`, `@release/server`.
- **Layout:** every package under `apps/` (`apps/ui`, `apps/playground`, `apps/frontend`, `apps/backend`). Root holds config only — no app code.
- **Styling:** CSS Modules stay exactly as authored. Tailwind is frontend-only, themed off existing tokens via `@theme`. Do **not** rewrite CSS Modules into Tailwind.
- **i18n:** react-i18next, English + Russian. JSON catalogs under `apps/frontend/src/locales/{en,ru}/`. No user-facing string literals in `.tsx`. `@release/ui` never imports react-i18next — its components receive copy via props.
- **Backend:** signaling/lobby only — no game rules server-side.
- **Lint split:** Biome owns `.ts/.tsx/.js/.jsx`; Stylelint owns `.css`.
- **Commits:** frequent, one per task minimum, conventional-commit messages.

---

## File Structure

```
ReleaseBoardGameP2P/
├─ package.json                 # workspace root: scripts + shared devDeps
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ biome.json
├─ .stylelintrc.json
├─ CLAUDE.md
├─ AGENTS.md
├─ docs/...
└─ apps/
   ├─ ui/
   │  ├─ package.json           # @release/ui (exports source)
   │  ├─ tsconfig.json
   │  ├─ vitest.config.ts
   │  └─ src/
   │     ├─ index.ts            # public API barrel
   │     ├─ assets/             # moved from public/assets
   │     ├─ design/  primitives/  table/  screens/  boot/  cards/  animations/  mocks/
   │     └─ ...
   ├─ playground/
   │  ├─ package.json           # @release/playground
   │  ├─ index.html  vite.config.ts  tsconfig.json
   │  └─ src/  (main.tsx, Playground.tsx, stories/*)
   ├─ frontend/
   │  ├─ package.json           # @release/web
   │  ├─ index.html  vite.config.ts  tsconfig.json
   │  └─ src/
   │     ├─ main.tsx  App.tsx
   │     ├─ i18n.ts
   │     ├─ index.css            # Tailwind entry + @theme token bridge
   │     └─ locales/{en,ru}/common.json
   └─ backend/
      ├─ package.json           # @release/server
      ├─ tsconfig.json  vitest.config.ts
      └─ src/  (server.ts, sessions.ts, signaling.ts, index.ts)
```

---

## Task 1: Workspace root + shared tooling

**Files:**
- Create: `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `.stylelintrc.json`
- Modify: `package.json` (rewrite root), `.gitignore` (already updated — verify)
- Delete: `package-lock.json` (already removed), `vite.config.js` stays for now (moved in Task 6)

**Interfaces:**
- Produces: workspace root that resolves `apps/*`; root scripts `dev`/`build`/`lint`/`format`/`typecheck`/`test`; `tsconfig.base.json` for packages to extend; `biome.json` + `.stylelintrc.json` consumed by every package.

- [ ] **Step 1: Create the migration branch**

```bash
cd /Users/andreykonnov/dev/MythHand/ReleaseBoardGameP2P
git checkout -b migration/monorepo-scaffold
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
```

- [ ] **Step 3: Rewrite root `package.json`**

```json
{
  "name": "release-board-game-p2p",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "pnpm --filter @release/web dev",
    "dev:playground": "pnpm --filter @release/playground dev",
    "dev:server": "pnpm --filter @release/server dev",
    "build": "pnpm -r build",
    "lint": "biome check . && pnpm -r stylelint",
    "format": "biome format --write .",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "stylelint": "^16.10.0",
    "stylelint-config-standard": "^36.0.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  }
}
```

- [ ] **Step 5: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": { "ignore": ["**/dist", "**/node_modules", "**/*.css"] },
  "organizeImports": { "enabled": true },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" } }
}
```

- [ ] **Step 6: Create `.stylelintrc.json`**

```json
{
  "extends": ["stylelint-config-standard"],
  "rules": {
    "selector-class-pattern": null,
    "custom-property-empty-line-before": null,
    "value-keyword-case": null,
    "property-no-vendor-prefix": null
  }
}
```

- [ ] **Step 7: Verify `.gitignore` covers build output**

Run: `grep -E "node_modules|dist" .gitignore`
Expected: both present (they already are). If `dist/` missing, add it.

- [ ] **Step 8: Install and verify the workspace resolves**

Run: `pnpm install`
Expected: completes with no error; `pnpm-lock.yaml` updated. (No packages under `apps/` yet — that's fine.)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm workspace root + Biome/Stylelint/TS config"
```

---

## Task 2: Create `@release/ui` — relocate `src/` + assets (still JS)

Move the visual layer into the package and make card-art resolution work from inside the package (so any consuming Vite app resolves the same assets without a duplicated `public/` tree). Migration to TS is Tasks 3–4; here it stays JS via `allowJs`.

**Files:**
- Move: `src/` → `apps/ui/src/`; `public/assets/` → `apps/ui/src/assets/`
- Create: `apps/ui/package.json`, `apps/ui/tsconfig.json`
- Modify: `apps/ui/src/cards/catalogue.js` (art resolution via glob), `apps/ui/src/screens/Start/Start.jsx` + any component referencing `/assets/...` (brand/audio paths)

**Interfaces:**
- Produces: package `@release/ui`; `assetUrl(relativeArtPath)` returns a Vite-resolved URL; art/cover/brand/audio fields become package-relative keys (e.g. `cards/base/Release 3 - 4 qty.png`).

- [ ] **Step 1: Move source and assets with git**

```bash
mkdir -p apps/ui/src
git mv src apps/ui/src/_moved && rsync -a apps/ui/src/_moved/ apps/ui/src/ && rm -rf apps/ui/src/_moved
git mv public/assets apps/ui/src/assets
```

If the nested-move above is awkward in your shell, equivalently: `git mv src/* apps/ui/src/` after `mkdir -p apps/ui/src`, then `git mv public/assets apps/ui/src/assets`. Confirm `apps/ui/src/cards`, `apps/ui/src/primitives`, `apps/ui/src/assets/cards` all exist.

- [ ] **Step 2: Create `apps/ui/package.json`**

```json
{
  "name": "@release/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./tokens.css": "./src/design/tokens.css", "./global.css": "./src/design/global.css" },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "stylelint": "stylelint \"src/**/*.css\"",
    "test": "vitest run"
  },
  "peerDependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "jsdom": "^25.0.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  }
}
```

(`./src/index.ts` is created in Task 3. While files are still `.jsx` this exports field is not yet imported by anyone — playground/frontend are wired in Tasks 5–6 after the barrel exists.)

- [ ] **Step 3: Create `apps/ui/tsconfig.json` (allowJs during migration)**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": false,
    "baseUrl": "src",
    "paths": { "@/*": ["*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Replace card-art resolution with a Vite glob map**

In `apps/ui/src/cards/catalogue.js`, replace the `assetUrl`/`COVERS`/`B`/`A` block and each card's `art` value so paths are package-relative and resolved through `import.meta.glob`. Change the helpers to:

```js
// Resolve every card image bundled in this package to its final URL.
// import.meta.glob runs relative to THIS file, so consuming apps resolve the
// same assets without a duplicated public/ tree.
const ART = import.meta.glob('../assets/cards/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

// key like "cards/base/Release 3 - 4 qty.png" -> resolved URL
export const assetUrl = (key) => {
  const hit = ART[`../assets/${key}`]
  if (!hit) throw new Error(`Unknown card asset: ${key}`)
  return hit
}

export const COVERS = {
  base: assetUrl('cards/covers/Cover - base - 104 qty.png'),
  ai: assetUrl('cards/covers/Cover - ai - 21 qty.png'),
}

const B = (file) => assetUrl(`cards/base/${file}`)
const A = (file) => assetUrl(`cards/ai/${file}`)
```

The `CARDS` array stays as-is — `B('Release 3 - 4 qty.png')` now returns a resolved URL instead of a string path. The `card.art` field is therefore already a usable URL; `CardFace` keeps using `card.art` directly.

- [ ] **Step 5: Fix remaining absolute `/assets/...` references to use glob URLs**

Other files reference brand/audio assets by absolute path. Update each to import the asset so Vite resolves it:
- `apps/ui/src/screens/Start/Start.jsx`: replace `const LOGO = '/assets/brand/release_logo.svg'` with `import LOGO from '../../assets/brand/release_logo.svg'`.
- `apps/ui/src/boot/Logo.jsx` (if it references `/assets/brand/...`): same `import` pattern.
- `apps/ui/src/boot/audio.js` (if it references `/assets/audio/...`): `import themeUrl from '../assets/audio/theme.wav'` etc.
- The home photo `public/assets/home/photo.jpg` if referenced in a `.module.css` via `url(/assets/...)`: change to a package-relative `url(../../assets/home/photo.jpg)` from that CSS file's location.

Find them all:

Run: `grep -rn "/assets/" apps/ui/src`
Expected after edits: zero matches (every asset is now an `import` or a CSS-relative `url(...)`).

- [ ] **Step 6: Update internal `@/` imports**

Components import siblings via `@/...` (e.g. `import { CATEGORIES } from '@/cards'`). The `@/*` → `src/*` alias is declared in `apps/ui/tsconfig.json` (Step 3) and will be mirrored in each app's Vite config. No source edits needed here; just confirm the alias maps correctly.

Run: `grep -rn "from '@/" apps/ui/src | head`
Expected: matches resolve under `apps/ui/src` (e.g. `@/cards` → `apps/ui/src/cards`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: relocate visual layer to @release/ui, resolve assets via Vite glob"
```

---

## Task 3: `@release/ui` TS migration — data layer + types + public API

Migrate the non-component modules first (pure data/logic), define the shared types, and create the public barrel. These have no JSX and are the foundation the components type against.

**Files:**
- Create: `apps/ui/src/index.ts`, `apps/ui/src/cards/types.ts`
- Rename+type: `cards/categories.js→.ts`, `cards/catalogue.js→.ts`, `cards/index.js→.ts`, `animations/presets.js→.ts`, `animations/play.js→.ts`, `animations/index.js→.ts`, `boot/lines.js→.ts`, `mocks/hand.js→.ts`, `mocks/table.js→.ts`

**Interfaces:**
- Produces:
  - `Card` type: `{ id: string; name: string; category: CategoryId; deck: 'base' | 'ai'; art: string; tags: CardTag[]; qty: number }`
  - `CategoryId = 'release'|'attack'|'defense'|'protection'|'operation'|'support'|'trigger'|'ai'`
  - `CardTag = 'lightning'|'sudo'|'cancel'|'unicorn'|'trigger'|'ai'|'combo-source'`
  - `CARDS: Card[]`, `COVERS: Record<'base'|'ai', string>`, `assetUrl(key: string): string`, `cardById(id: string): Card | undefined`, `cardCanTarget(card?: Card): boolean`, `isComboSource(card?: Card): boolean`, `validComboTarget(source?: Card, target?: Card): boolean`
  - `CATEGORIES: Record<CategoryId, { id: CategoryId; label: string; accent: string }>`
  - `buildSequence(): string[]`
  - barrel `@release/ui` re-exports the above + every component from Task 4.

- [ ] **Step 1: Create `apps/ui/src/cards/types.ts`**

```ts
export type CategoryId =
  | 'release' | 'attack' | 'defense' | 'protection'
  | 'operation' | 'support' | 'trigger' | 'ai'

export type CardTag =
  | 'lightning' | 'sudo' | 'cancel' | 'unicorn'
  | 'trigger' | 'ai' | 'combo-source'

export interface Card {
  id: string
  name: string
  category: CategoryId
  deck: 'base' | 'ai'
  art: string
  tags: CardTag[]
  qty: number
}

export interface Category {
  id: CategoryId
  label: string
  accent: string
}
```

- [ ] **Step 2: Migrate `cards/categories.ts`**

Rename `categories.js`→`categories.ts`. Type the export:

```ts
import type { Category, CategoryId } from './types'

export const CATEGORIES: Record<CategoryId, Category> = {
  release: { id: 'release', label: 'Release', accent: 'var(--cat-release)' },
  attack: { id: 'attack', label: 'Attack', accent: 'var(--cat-attack)' },
  defense: { id: 'defense', label: 'Defense', accent: 'var(--cat-defense)' },
  protection: { id: 'protection', label: 'Protection', accent: 'var(--cat-protection)' },
  operation: { id: 'operation', label: 'Operation', accent: 'var(--cat-operation)' },
  support: { id: 'support', label: 'Support', accent: 'var(--cat-support)' },
  trigger: { id: 'trigger', label: 'Trigger', accent: 'var(--cat-trigger)' },
  ai: { id: 'ai', label: 'AI / Events', accent: 'var(--cat-ai)' },
}
```

- [ ] **Step 3: Migrate `cards/catalogue.ts`**

Rename `catalogue.js`→`catalogue.ts`. Keep the glob-based `assetUrl`/`COVERS`/`B`/`A` from Task 2. Type the surface:

```ts
import type { Card } from './types'

const ART = import.meta.glob('../assets/cards/**/*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>

export const assetUrl = (key: string): string => {
  const hit = ART[`../assets/${key}`]
  if (!hit) throw new Error(`Unknown card asset: ${key}`)
  return hit
}
// COVERS, B, A unchanged from Task 2
// CARDS typed as Card[]:
export const CARDS: Card[] = [ /* ...existing entries unchanged... */ ]

export const cardById = (id: string): Card | undefined => CARDS.find((c) => c.id === id)
export const cardCanTarget = (card?: Card): boolean => !!card?.tags.includes('lightning')
export const isComboSource = (card?: Card): boolean => !!card?.tags.includes('combo-source')
export const validComboTarget = (source?: Card, target?: Card): boolean => {
  if (!source || !target || source.id === target.id) return false
  if (source.id === 'support-sudo') return target.tags.includes('sudo')
  if (source.id === 'support-code-review') return target.category === 'release'
  return false
}
```

Add `"vite/client"` types so `import.meta.glob` is recognized (done globally in Step 7).

- [ ] **Step 4: Migrate `cards/index.ts`, `animations/*`, `mocks/*`**

Rename each `.js`→`.ts`. These are re-export barrels / data and need no signature changes beyond renaming and adding return types where a function is exported. For `animations/play.ts`, type the public functions you find there (e.g. `play(name: string, el: HTMLElement, ...): Animation | void` — match the actual implementation signature; do not invent parameters).

- [ ] **Step 5: Migrate `boot/lines.ts`**

Rename `boot/lines.js`→`boot/lines.ts`. It touches non-standard `navigator` fields (`connection`, `deviceMemory`, `userAgentData`). Add a local augmentation at the top instead of `any`:

```ts
interface NavigatorConnection { effectiveType?: string; downlink?: number }
interface ExtendedNavigator extends Navigator {
  connection?: NavigatorConnection
  deviceMemory?: number
  userAgentData?: { platform?: string }
}
```

Cast once where read: `const n = navigator as ExtendedNavigator`. Type `buildSequence(): string[]`. The generator functions can stay untyped-inferred; add `: Generator<string>` return types if `tsc` complains. (This file is system-flavor telemetry, not localizable copy — it stays as literals.)

- [ ] **Step 6: Create the public barrel `apps/ui/src/index.ts`**

```ts
// Data + logic
export { CATEGORIES } from './cards/categories'
export {
  CARDS, COVERS, assetUrl, cardById, cardCanTarget, isComboSource, validComboTarget,
} from './cards/catalogue'
// The card *type* is re-exported as `CardData` to avoid colliding with the `Card`
// *component* default export below. Internally the type stays named `Card`.
export type { Card as CardData, CategoryId, CardTag, Category } from './cards/types'
export { PRESETS, play, presetNames } from './animations'
export { buildSequence } from './boot/lines'

// Components (added/uncommented as Task 4 migrates each)
export { default as Card } from './primitives/Card'
export { default as Arrow } from './primitives/Arrow'
export { default as Pile } from './primitives/Pile'
export { default as Button } from './primitives/Button'
export { default as Modal } from './primitives/Modal'
export { default as Hand } from './table/Hand'
export { default as Table } from './table/Table'
export { default as ReleaseZone } from './table/ReleaseZone'
export { default as Seat } from './table/Seat'
export { default as MoveHistory } from './table/MoveHistory'
export { default as ModesInfo } from './table/ModesInfo'
export { default as Start } from './screens/Start'
export { default as Loader } from './boot'
```

> Note: there is a name clash between the `Card` **type** and the `Card` **component**. Resolve it **only at the public barrel**: the component is exported as `Card` (value) and the type is re-exported as `CardData` (`export type { Card as CardData, ... }`, shown above). **Internally** (inside `apps/ui/src`) the type keeps the name `Card` — components import it as `Card` from `./cards/types`. External consumers (frontend, playground) import the type as `CardData`.

- [ ] **Step 7: Add Vite client types to the package tsconfig**

In `apps/ui/tsconfig.json` `compilerOptions`, add `"types": ["vite/client"]` and add `vite` to devDependencies (`"vite": "^6.0.7"`), then `pnpm install`.

- [ ] **Step 8: Typecheck the data layer**

Run: `pnpm --filter @release/ui typecheck`
Expected: PASS (component `.jsx` still allowed via `allowJs`). Fix any data-layer type errors before moving on.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(ui): migrate data layer to TypeScript, add card types + public barrel"
```

---

## Task 4: `@release/ui` TS migration — components

Migrate every `.jsx` component to `.tsx` with typed props. This is mechanical per file; the gate is `tsc` with `allowJs` turned **off** at the end. Migrate in dependency order: primitives → table → screens → boot.

**Files (rename `.jsx`→`.tsx`, add a props interface to each):**
- `primitives/Card/{Card,CardFace,CardBack}.tsx`, `primitives/Arrow/Arrow.tsx`, `primitives/Pile/Pile.tsx`, `primitives/Button/Button.tsx`, `primitives/Modal/Modal.tsx`
- `table/Hand/Hand.tsx`, `table/Table/Table.tsx`, `table/ReleaseZone/ReleaseZone.tsx`, `table/Seat/Seat.tsx`, `table/MoveHistory/MoveHistory.tsx`, `table/ModesInfo/ModesInfo.tsx`
- `screens/Start/Start.tsx`
- `boot/{Loader,Logo}.tsx`
- `design/{TokenPreview,TypographyPreview}.tsx`
- Each folder's `index.js`→`index.ts`
- Modify: `apps/ui/tsconfig.json` (set `allowJs: false` at the end)

**Interfaces:**
- Consumes: the `Card` and `CategoryId` types from `./cards/types` (Task 3). (Internally the card type is named `Card`; the public barrel re-exports it as `CardData`.)
- Produces: typed React components. Document each component's prop interface from its existing destructured props + JSDoc. Example contracts to preserve exactly:
  - `Button`: `{ children: ReactNode; variant?: 'primary' | 'tech'; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>`
  - `Card`: `{ card: Card; faceDown?: boolean; state?: 'idle'|'playable'|'selected'|'disabled'; tilt?: boolean; interactive?: boolean; width?: string; onClick?: () => void }` (the `card` prop uses the `Card` type imported from `./cards/types`)
  - `Modal`: `{ open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }`

- [ ] **Step 1: Migrate the primitives**

For each primitive: `git mv X.jsx X.tsx`, convert the JSDoc `@param` block into a TS `interface XProps`, type the function signature `export default function X(props: XProps)`. CSS Module imports are unchanged. Example — `Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'tech'
  className?: string
}

export default function Button({ children, variant = 'primary', className = '', ...rest }: ButtonProps) {
  const isPrimary = variant === 'primary'
  return (
    <button className={`${styles.btn} ${styles[variant]} ${className}`} type="button" {...rest}>
      {isPrimary && <span className={styles.bracket}>[</span>}
      <span className={styles.label}>{children}</span>
      {isPrimary && <span className={styles.bracket}>]</span>}
    </button>
  )
}
```

Rename each `index.js`→`index.ts` (content `export { default } from './X'` — drop the `.jsx` extension).

- [ ] **Step 2: Add a CSS Modules type declaration**

Create `apps/ui/src/css-modules.d.ts` so `import styles from './X.module.css'` is typed:

```ts
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
```

- [ ] **Step 3: Migrate table components, then screens, then boot/design**

Same recipe. For `Start.tsx`, leave the Russian copy in place **for now** — it is lifted to props in Task 8. Components that take a `card` prop import the `Card` type from `./cards/types` (relative path).

- [ ] **Step 4: Flip the package to strict TS**

In `apps/ui/tsconfig.json`, set `"allowJs": false`. Confirm no `.js`/`.jsx` source remains:

Run: `find apps/ui/src -name "*.jsx" -o -name "*.js" | grep -v node_modules`
Expected: empty output.

- [ ] **Step 5: Typecheck the whole package**

Run: `pnpm --filter @release/ui typecheck`
Expected: PASS.

- [ ] **Step 6: Add a Card smoke test**

Create `apps/ui/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { environment: 'jsdom', globals: true },
})
```

Add `@vitejs/plugin-react` to `apps/ui` devDeps, `pnpm install`. Create `apps/ui/src/primitives/Card/Card.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { CARDS } from '../../cards/catalogue'
import Card from './Card'

it('renders a card without crashing', () => {
  const { container } = render(<Card card={CARDS[0]} />)
  expect(container.firstChild).not.toBeNull()
})
```

- [ ] **Step 7: Run the test**

Run: `pnpm --filter @release/ui test`
Expected: PASS (1 test).

- [ ] **Step 8: Lint CSS**

Run: `pnpm --filter @release/ui stylelint`
Expected: PASS (fix any standard-config violations; do not change visual values).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(ui): migrate all components to TypeScript, add Card smoke test"
```

---

## Task 5: `apps/playground` — relocate, migrate to TS, wire to `@release/ui`

**Files:**
- Move: `playground/` → `apps/playground/`
- Create: `apps/playground/package.json`, `apps/playground/vite.config.ts`, `apps/playground/tsconfig.json`
- Rename: `main.jsx→main.tsx`, `Playground.jsx→Playground.tsx`, `stories/*.jsx→*.tsx`
- Modify: story imports `@/...` → `@release/ui`; `index.html` script path

**Interfaces:**
- Consumes: `@release/ui` barrel (components + data).
- Produces: a standalone Vite app `@release/playground` with `dev`/`build`/`typecheck` scripts.

- [ ] **Step 1: Move the folder**

```bash
git mv playground apps/playground
```

- [ ] **Step 2: Create `apps/playground/package.json`**

```json
{
  "name": "@release/playground",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "stylelint": "stylelint \"**/*.css\" --allow-empty-input",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": { "@release/ui": "workspace:*", "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.7"
  }
}
```

- [ ] **Step 3: Create `apps/playground/vite.config.ts`**

The UI library is consumed **from source** via alias (reliable with Vite + workspace pnpm). Map both `@release/ui` and the library's internal `@/` alias:

```ts
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const uiSrc = fileURLToPath(new URL('../ui/src', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@release/ui', replacement: `${uiSrc}/index.ts` },
      { find: '@', replacement: uiSrc },
    ],
  },
})
```

- [ ] **Step 4: Create `apps/playground/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["vite/client"],
    "paths": { "@release/ui": ["../ui/src/index.ts"], "@/*": ["../ui/src/*"] }
  },
  "include": ["."]
}
```

- [ ] **Step 5: Migrate playground source to TS and repoint imports**

Rename `main.jsx→main.tsx`, `Playground.jsx→Playground.tsx`, each `stories/*.jsx→*.tsx`. In `Playground.tsx` and the stories, change UI imports from `@/design/...` / `@/primitives/...` to the barrel where possible (e.g. `import { Card, Hand, Table } from '@release/ui'`). `TokenPreview`/`TypographyPreview` live in `@release/ui` `design/` — export them from the barrel if the playground needs them (add to `apps/ui/src/index.ts`), or import via the `@` alias. Type the `stories` registry entries: `interface Story { id: string; title: string; render: () => ReactNode }`.

- [ ] **Step 6: Update `index.html`**

In `apps/playground/index.html`, ensure the script tag points at `/main.tsx` (was `/main.jsx`) and the mount node id matches `main.tsx` (`playground`).

- [ ] **Step 7: Typecheck + build**

Run: `pnpm --filter @release/playground typecheck && pnpm --filter @release/playground build`
Expected: both PASS; build emits `dist/`.

- [ ] **Step 8: Smoke-run the dev server**

Run: `pnpm --filter @release/playground dev` (Ctrl-C after it prints the local URL with no errors).
Expected: Vite starts, no missing-module/asset errors in the startup output.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(playground): relocate to apps/, migrate to TS, consume @release/ui"
```

---

## Task 6: `apps/frontend` — relocate the root app, migrate to TS, wire to `@release/ui`

The current root Vite app becomes the frontend. Tailwind (Task 7) and i18n (Task 8) are layered on after the app boots.

**Files:**
- Move: root `index.html`→`apps/frontend/index.html`; `src/main.jsx`→`apps/frontend/src/main.tsx` (this `src/main.jsx` was already moved into ui in Task 2 — recreate the app's own `main.tsx`); `src/app/`→`apps/frontend/src/App.tsx`
- Create: `apps/frontend/package.json`, `apps/frontend/vite.config.ts`, `apps/frontend/tsconfig.json`
- Delete: root `vite.config.js`, root `index.html`, root `package-lock.json` (gone)

> Clarification: in Task 2 the **entire** `src/` (including `main.jsx` and `app/App.jsx`) moved into `apps/ui/src`. The app shell (`App`, `main`) does not belong in the UI library — move it back out into the frontend here.

- [ ] **Step 1: Move the app shell out of the UI package into the frontend**

```bash
mkdir -p apps/frontend/src
git mv apps/ui/src/app/App.module.css apps/frontend/src/App.module.css
git mv apps/ui/src/app/App.jsx apps/frontend/src/App.tsx
rmdir apps/ui/src/app 2>/dev/null || true
git rm apps/ui/src/main.jsx
git mv index.html apps/frontend/index.html
git rm vite.config.js
```

(`main.tsx` is recreated fresh in Step 4. `App.jsx`→`App.tsx` will be typed in Step 5.)

- [ ] **Step 2: Create `apps/frontend/package.json`**

```json
{
  "name": "@release/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit -p tsconfig.json && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "stylelint": "stylelint \"src/**/*.css\"",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": { "@release/ui": "workspace:*", "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.7"
  }
}
```

- [ ] **Step 3: Create `apps/frontend/vite.config.ts`** (same alias strategy as playground)

```ts
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const uiSrc = fileURLToPath(new URL('../ui/src', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@release/ui', replacement: `${uiSrc}/index.ts` },
      { find: '@', replacement: uiSrc },
    ],
  },
})
```

- [ ] **Step 4: Create `apps/frontend/src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@release/ui/global.css'
import App from './App'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 5: Type `App.tsx`**

`App.tsx` needs no props. Convert it to a typed default-export component (`export default function App()`), keep its CSS Module import. Leave its Russian copy for Task 8.

- [ ] **Step 6: Create `apps/frontend/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["vite/client"],
    "paths": { "@release/ui": ["../ui/src/index.ts"], "@/*": ["../ui/src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 7: Update `index.html`**

In `apps/frontend/index.html`, the script tag must be `<script type="module" src="/src/main.tsx"></script>`. Keep the Google Fonts links and `<div id="root">`.

- [ ] **Step 8: Typecheck + build + dev smoke**

Run: `pnpm --filter @release/web typecheck && pnpm --filter @release/web build`
Expected: PASS; `dist/` emitted.
Run: `pnpm --filter @release/web dev` (Ctrl-C after the URL prints clean).
Expected: app renders the shell, no console/startup errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(frontend): relocate root app to apps/frontend, migrate to TS, consume @release/ui"
```

---

## Task 7: `apps/frontend` — Tailwind v4 themed off design tokens

**Files:**
- Create: `apps/frontend/src/index.css` (Tailwind entry + `@theme` bridge)
- Modify: `apps/frontend/vite.config.ts` (add Tailwind plugin), `apps/frontend/src/main.tsx` (import `index.css`), `apps/frontend/package.json` (deps)

**Interfaces:**
- Produces: Tailwind utilities resolving to the existing CSS variables — `bg-surface-0/1`, `text-cat-release`, `text-fg`, `bg-bg`, etc.

- [ ] **Step 1: Add Tailwind v4 deps**

Add to `apps/frontend` devDeps and `pnpm install`:

```json
"tailwindcss": "^4.0.0",
"@tailwindcss/vite": "^4.0.0"
```

- [ ] **Step 2: Register the Tailwind Vite plugin**

In `apps/frontend/vite.config.ts`, import and add the plugin:

```ts
import tailwindcss from '@tailwindcss/vite'
// ...
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // resolve.alias unchanged
})
```

- [ ] **Step 3: Create `apps/frontend/src/index.css` with the token bridge**

```css
@import "tailwindcss";

/* Bridge the @release/ui design tokens (defined in tokens.css :root) into the
   Tailwind v4 theme so utilities resolve to the SAME CSS variables. */
@theme {
  --color-bg: var(--bg);
  --color-fg: var(--fg);
  --color-surface-0: var(--surface-0);
  --color-surface-1: var(--surface-1);
  --color-brand-green: var(--brand-green);
  --color-cat-release: var(--cat-release);
  --color-cat-attack: var(--cat-attack);
  --color-cat-protection: var(--cat-protection);
  --color-cat-defense: var(--cat-defense);
  --color-cat-operation: var(--cat-operation);
  --color-cat-support: var(--cat-support);
  --color-cat-ai: var(--cat-ai);
  --color-cat-trigger: var(--cat-trigger);
}
```

> `tokens.css` is imported transitively via `@release/ui/global.css` (which `@import`s `tokens.css`). Confirm `global.css` imports `tokens.css`; if not, add `@import "@release/ui/tokens.css";` at the top of `index.css` before `@theme` so the variables exist.

- [ ] **Step 4: Import the Tailwind entry**

In `apps/frontend/src/main.tsx`, add `import './index.css'` **after** the `@release/ui/global.css` import (so token defaults load first).

- [ ] **Step 5: Prove a token-backed utility renders**

Temporarily add `className="bg-surface-1 text-cat-release"` to the App shell's root element. Run `pnpm --filter @release/web dev`, confirm in the browser the background uses `--surface-1` and text uses `--cat-release`. Then revert the temporary class (or keep if it fits the shell).

- [ ] **Step 6: Build to confirm Tailwind compiles**

Run: `pnpm --filter @release/web build`
Expected: PASS; CSS bundle contains the generated utilities.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(frontend): add Tailwind v4 themed off @release/ui design tokens"
```

---

## Task 8: `apps/frontend` — react-i18next (en/ru), lift copy out of TSX

Wire i18n in the frontend and move all user-facing copy into JSON catalogs. The UI library stays i18n-agnostic: `Start` (and `App`) receive copy via props; the frontend passes translated strings.

**Files:**
- Create: `apps/frontend/src/i18n.ts`, `apps/frontend/src/locales/en/common.json`, `apps/frontend/src/locales/ru/common.json`, `apps/frontend/src/components/LanguageSwitch.tsx`
- Modify: `apps/frontend/src/main.tsx` (import `./i18n`), `apps/frontend/src/App.tsx` (use `useTranslation`), `apps/ui/src/screens/Start/Start.tsx` (accept `copy` prop), `apps/ui/src/index.ts` (export `StartCopy` type), `apps/frontend/package.json` (deps)

**Interfaces:**
- Consumes: `@release/ui` `Start`.
- Produces:
  - `apps/ui` exports `StartCopy` type and `Start` now takes `{ copy: StartCopy }`.
  - `StartCopy = { tags: string[]; description: string; createGame: string; joinGame: string; videoReview: string; close: string; createTitle: string; createStub: string; createCta: string; joinTitle: string; gameCodeLabel: string; gameCodePlaceholder: string; joinCta: string; logoAlt: string }`
  - i18n default language `en`, fallback `en`, languages `en`/`ru`.

- [ ] **Step 1: Add i18n deps**

Add to `apps/frontend` deps and `pnpm install`:

```json
"i18next": "^24.0.0",
"react-i18next": "^15.1.0",
"i18next-browser-languagedetector": "^8.0.0"
```

- [ ] **Step 2: Create the English catalog `apps/frontend/src/locales/en/common.json`**

```json
{
  "app": {
    "titleLead": "Release",
    "titleSub": "at any cost",
    "foundationTag": "visual layer — foundation",
    "phasesHint": "Screens (boot → lobby → game → game over) arrive in phases.",
    "devShowcase": "component dev showcase →"
  },
  "start": {
    "logoAlt": "Release at any cost",
    "tagOpenP2P": "Open P2P project",
    "tagBoardCard": "Board card game",
    "description": "A strategic card game about the real grind of software development. Bugs, surprise events, rivals' attacks — beat it all and release first.",
    "createGame": "create game",
    "joinGame": "join",
    "videoReview": "video overview",
    "close": "close",
    "createTitle": "Create game",
    "createStub": "Match settings — mode selection (hand limit, Fast Release, release condition, etc.). Soon.",
    "createCta": "create",
    "joinTitle": "Join",
    "gameCodeLabel": "game code",
    "gameCodePlaceholder": "e.g. 4F2A-9K",
    "joinCta": "enter"
  },
  "language": { "en": "EN", "ru": "RU" }
}
```

- [ ] **Step 3: Create the Russian catalog `apps/frontend/src/locales/ru/common.json`** (original copy preserved)

```json
{
  "app": {
    "titleLead": "Release",
    "titleSub": "любой ценой",
    "foundationTag": "visual layer — foundation",
    "phasesHint": "Экраны (boot → lobby → game → game over) появятся по фазам.",
    "devShowcase": "dev-витрина компонентов →"
  },
  "start": {
    "logoAlt": "Release любой ценой",
    "tagOpenP2P": "Открытый P2P-проект",
    "tagBoardCard": "Настольная карточная игра",
    "description": "Стратегическая карточная игра про реальные будни разработки. Баги, неожиданные события, атаки соперников — преодолевай всё это и зарелизь первым.",
    "createGame": "создать игру",
    "joinGame": "подключиться",
    "videoReview": "видео-обзор",
    "close": "закрыть",
    "createTitle": "Создать игру",
    "createStub": "Настройки партии — выбор режимов (лимит руки, Fast Release, условие релиза и т.д.). Скоро.",
    "createCta": "создать",
    "joinTitle": "Подключиться",
    "gameCodeLabel": "код игры",
    "gameCodePlaceholder": "напр. 4F2A-9K",
    "joinCta": "войти"
  },
  "language": { "en": "EN", "ru": "RU" }
}
```

- [ ] **Step 4: Create `apps/frontend/src/i18n.ts`**

```ts
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import enCommon from './locales/en/common.json'
import ruCommon from './locales/ru/common.json'

export const resources = {
  en: { common: enCommon },
  ru: { common: ruCommon },
} as const

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'ru'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  })

export default i18n
```

- [ ] **Step 5: Add a typed-keys guard so `t()` keys are checked**

Create `apps/frontend/src/i18next.d.ts`:

```ts
import 'i18next'
import type enCommon from './locales/en/common.json'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: { common: typeof enCommon }
  }
}
```

- [ ] **Step 6: Initialize i18n at the entry**

In `apps/frontend/src/main.tsx`, add `import './i18n'` (before rendering `App`).

- [ ] **Step 7: Refactor `App.tsx` to use translations**

Replace every literal in `App.tsx` with `t(...)`:

```tsx
import { useTranslation } from 'react-i18next'
import styles from './App.module.css'

export default function App() {
  const { t } = useTranslation()
  return (
    <div className={styles.app}>
      <main className={styles.shell}>
        <h1 className={styles.brand}>
          {t('app.titleLead')} <span className={styles.sub}>{t('app.titleSub')}</span>
        </h1>
        <p className={styles.tag}>{t('app.foundationTag')}</p>
        <p className={styles.hint}>{t('app.phasesHint')}</p>
        <p className={styles.dev}>
          {t('app.devShowcase')} <a className={styles.link} href="/playground/">/playground/</a>
        </p>
      </main>
    </div>
  )
}
```

- [ ] **Step 8: Make `Start` (in `@release/ui`) take copy via props**

In `apps/ui/src/screens/Start/Start.tsx`, add and consume a `copy` prop; replace every Russian literal with `copy.*`. Define and export the type:

```tsx
export interface StartCopy {
  logoAlt: string
  tags: string[]
  description: string
  createGame: string
  joinGame: string
  videoReview: string
  close: string
  createTitle: string
  createStub: string
  createCta: string
  joinTitle: string
  gameCodeLabel: string
  gameCodePlaceholder: string
  joinCta: string
}

export default function Start({ copy }: { copy: StartCopy }) {
  // ...replace literals: alt={copy.logoAlt}; tags.map; copy.description;
  // button labels copy.createGame/joinGame; aria/captions copy.videoReview/close;
  // Modal titles copy.createTitle/joinTitle; copy.createStub/createCta;
  // copy.gameCodeLabel (span), copy.gameCodePlaceholder (input placeholder), copy.joinCta
}
```

Export the type from `apps/ui/src/index.ts`: `export type { StartCopy } from './screens/Start/Start'`.

- [ ] **Step 9: Add the language switch component**

Create `apps/frontend/src/components/LanguageSwitch.tsx`:

```tsx
import { useTranslation } from 'react-i18next'

export default function LanguageSwitch() {
  const { i18n, t } = useTranslation()
  const langs = ['en', 'ru'] as const
  return (
    <div>
      {langs.map((lng) => (
        <button
          key={lng}
          type="button"
          aria-pressed={i18n.resolvedLanguage === lng}
          onClick={() => i18n.changeLanguage(lng)}
        >
          {t(`language.${lng}`)}
        </button>
      ))}
    </div>
  )
}
```

(Mount it in `App.tsx` where convenient — styling is later work.)

- [ ] **Step 10: Wire the frontend to pass `Start` its translated copy (reference usage)**

Anywhere the frontend renders `Start` (a later phase actually routes to it; for now add a typed helper so the contract is proven), build `StartCopy` from `t`:

```tsx
import { useTranslation } from 'react-i18next'
import { Start, type StartCopy } from '@release/ui'

export function StartScreen() {
  const { t } = useTranslation()
  const copy: StartCopy = {
    logoAlt: t('start.logoAlt'),
    tags: [t('start.tagOpenP2P'), t('start.tagBoardCard')],
    description: t('start.description'),
    createGame: t('start.createGame'),
    joinGame: t('start.joinGame'),
    videoReview: t('start.videoReview'),
    close: t('start.close'),
    createTitle: t('start.createTitle'),
    createStub: t('start.createStub'),
    createCta: t('start.createCta'),
    joinTitle: t('start.joinTitle'),
    gameCodeLabel: t('start.gameCodeLabel'),
    gameCodePlaceholder: t('start.gameCodePlaceholder'),
    joinCta: t('start.joinCta'),
  }
  return <Start copy={copy} />
}
```

Save as `apps/frontend/src/components/StartScreen.tsx`. The playground's `StartStory` must now pass a literal `copy` object (English or Russian strings inline in the story file — stories are not user-facing product copy, so inline strings there are acceptable).

- [ ] **Step 11: Typecheck both affected packages**

Run: `pnpm --filter @release/ui typecheck && pnpm --filter @release/web typecheck`
Expected: PASS. (UI now exposes `StartCopy`; frontend `t()` keys are type-checked against the catalog.)

- [ ] **Step 12: Dev smoke — language switch flips copy**

Run: `pnpm --filter @release/web dev`, open the app, click the language switch, confirm App copy toggles EN/RU.
Expected: copy switches; no console errors.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(frontend): add react-i18next (en/ru), lift copy to catalogs, Start takes copy via props"
```

---

## Task 9: `apps/backend` — Fastify + ws P2P signaling server

In-memory session registry + WebSocket signaling relay. No game rules. Test-first for the session logic.

**Files:**
- Create: `apps/backend/package.json`, `apps/backend/tsconfig.json`, `apps/backend/vitest.config.ts`
- Create: `apps/backend/src/sessions.ts`, `apps/backend/src/sessions.test.ts`, `apps/backend/src/signaling.ts`, `apps/backend/src/server.ts`, `apps/backend/src/index.ts`

**Interfaces:**
- Produces:
  - `createSession(): Session` where `Session = { id: string; code: string; createdAt: number; peers: string[] }`
  - `joinSession(code: string): { session: Session; peerId: string } | null`
  - `getSession(id: string): Session | undefined`
  - `buildServer(): FastifyInstance` with routes `POST /sessions`, `POST /sessions/:id/join`, `GET /sessions/:id`, `GET /healthz`, and a `ws` route `GET /sessions/:id/signal`.

- [ ] **Step 1: Create `apps/backend/package.json`**

```json
{
  "name": "@release/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "stylelint": "true",
    "test": "vitest run"
  },
  "dependencies": {
    "@fastify/websocket": "^11.0.1",
    "fastify": "^5.1.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.1",
    "@types/ws": "^8.5.13",
    "tsx": "^4.19.2"
  }
}
```

(`stylelint` is a no-op `true` so the root `pnpm -r stylelint` fan-out succeeds for a package with no CSS.)

- [ ] **Step 2: Create `apps/backend/tsconfig.json`** (Node, not DOM; emits to `dist`)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "noEmit": false,
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `apps/backend/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { environment: 'node' } })
```

- [ ] **Step 4: Write the failing session test**

`apps/backend/src/sessions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSession, getSession, joinSession } from './sessions'

describe('sessions', () => {
  it('creates a session with a unique id and a join code', () => {
    const a = createSession()
    const b = createSession()
    expect(a.id).not.toEqual(b.id)
    expect(a.code).toHaveLength(8)
    expect(getSession(a.id)?.id).toEqual(a.id)
  })

  it('joins an existing session by code and registers a peer', () => {
    const s = createSession()
    const result = joinSession(s.code)
    expect(result).not.toBeNull()
    expect(result?.session.id).toEqual(s.id)
    expect(getSession(s.id)?.peers).toContain(result?.peerId)
  })

  it('returns null when joining an unknown code', () => {
    expect(joinSession('NOPE0000')).toBeNull()
  })
})
```

- [ ] **Step 5: Run the test to confirm it fails**

Run: `pnpm --filter @release/server test`
Expected: FAIL — `./sessions` has no such exports.

- [ ] **Step 6: Implement `apps/backend/src/sessions.ts`**

```ts
import { randomBytes, randomUUID } from 'node:crypto'

export interface Session {
  id: string
  code: string
  createdAt: number
  peers: string[]
}

const sessions = new Map<string, Session>()
const byCode = new Map<string, string>()

const makeCode = (): string =>
  randomBytes(4).toString('hex').toUpperCase().slice(0, 8)

export function createSession(): Session {
  const session: Session = { id: randomUUID(), code: makeCode(), createdAt: Date.now(), peers: [] }
  sessions.set(session.id, session)
  byCode.set(session.code, session.id)
  return session
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id)
}

export function joinSession(code: string): { session: Session; peerId: string } | null {
  const id = byCode.get(code)
  if (!id) return null
  const session = sessions.get(id)
  if (!session) return null
  const peerId = randomUUID()
  session.peers.push(peerId)
  return { session, peerId }
}
```

- [ ] **Step 7: Run the test to confirm it passes**

Run: `pnpm --filter @release/server test`
Expected: PASS (3 tests).

- [ ] **Step 8: Implement the signaling relay `apps/backend/src/signaling.ts`**

```ts
import type { WebSocket } from 'ws'

// Per-session set of connected sockets; relays signaling payloads peer-to-peer.
const rooms = new Map<string, Set<WebSocket>>()

export function joinRoom(sessionId: string, socket: WebSocket): void {
  let room = rooms.get(sessionId)
  if (!room) {
    room = new Set()
    rooms.set(sessionId, room)
  }
  room.add(socket)
}

export function leaveRoom(sessionId: string, socket: WebSocket): void {
  const room = rooms.get(sessionId)
  if (!room) return
  room.delete(socket)
  if (room.size === 0) rooms.delete(sessionId)
}

// Broadcast a raw signaling message to every OTHER peer in the room.
export function relay(sessionId: string, from: WebSocket, data: string): void {
  const room = rooms.get(sessionId)
  if (!room) return
  for (const peer of room) {
    if (peer !== from && peer.readyState === peer.OPEN) peer.send(data)
  }
}
```

- [ ] **Step 9: Implement `apps/backend/src/server.ts`**

```ts
import websocket from '@fastify/websocket'
import Fastify, { type FastifyInstance } from 'fastify'
import { createSession, getSession, joinSession } from './sessions'
import { joinRoom, leaveRoom, relay } from './signaling'

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })
  await app.register(websocket)

  app.get('/healthz', async () => ({ status: 'ok' }))

  app.post('/sessions', async () => {
    const s = createSession()
    return { id: s.id, code: s.code }
  })

  app.post<{ Params: { id: string } }>('/sessions/:id/join', async (req, reply) => {
    const session = getSession(req.params.id)
    if (!session) return reply.code(404).send({ error: 'session not found' })
    const result = joinSession(session.code)
    if (!result) return reply.code(404).send({ error: 'session not found' })
    return { sessionId: result.session.id, peerId: result.peerId }
  })

  app.get<{ Params: { id: string } }>('/sessions/:id', async (req, reply) => {
    const session = getSession(req.params.id)
    if (!session) return reply.code(404).send({ error: 'session not found' })
    return { id: session.id, code: session.code, peers: session.peers.length }
  })

  app.get<{ Params: { id: string } }>('/sessions/:id/signal', { websocket: true }, (socket, req) => {
    const { id } = req.params
    if (!getSession(id)) {
      socket.close(1008, 'unknown session')
      return
    }
    joinRoom(id, socket)
    socket.on('message', (raw: Buffer) => relay(id, socket, raw.toString()))
    socket.on('close', () => leaveRoom(id, socket))
  })

  return app
}
```

- [ ] **Step 10: Implement the entrypoint `apps/backend/src/index.ts`**

```ts
import { buildServer } from './server'

const PORT = Number(process.env.PORT ?? 3001)

const start = async () => {
  const app = await buildServer()
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

void start()
```

- [ ] **Step 11: Add a server route smoke test**

Append to `apps/backend/src/sessions.test.ts` (or a new `server.test.ts`):

```ts
import { buildServer } from './server'

it('POST /sessions then GET /sessions/:id returns the session', async () => {
  const app = await buildServer()
  const created = await app.inject({ method: 'POST', url: '/sessions' })
  expect(created.statusCode).toBe(200)
  const { id } = created.json<{ id: string; code: string }>()
  const fetched = await app.inject({ method: 'GET', url: `/sessions/${id}` })
  expect(fetched.statusCode).toBe(200)
  expect(fetched.json<{ id: string }>().id).toBe(id)
  await app.close()
})
```

- [ ] **Step 12: Typecheck + test + build**

Run: `pnpm --filter @release/server typecheck && pnpm --filter @release/server test && pnpm --filter @release/server build`
Expected: all PASS; `dist/` emitted.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(backend): Fastify + ws P2P signaling server with session registry"
```

---

## Task 10: Project docs — `CLAUDE.md` + `AGENTS.md`

**Files:**
- Create: `CLAUDE.md`, `AGENTS.md` (repo root)

**Interfaces:**
- Produces: onboarding guide reflecting the final structure and rules from this plan.

- [ ] **Step 1: Write `CLAUDE.md`**

Include these sections (fill with the real, final facts from this repo — no placeholders):
- **Overview** — "Release любой ценой", a P2P web version of the board card game; pointer to `docs/rules-board-game.md`.
- **Monorepo layout** — the `apps/{ui,playground,frontend,backend}` table with one-line purpose each and package names (`@release/ui`, `@release/playground`, `@release/web`, `@release/server`).
- **Stack per app** — ui: TS + CSS Modules + design tokens; playground: Vite sandbox; frontend: Vite + TS + React + Tailwind v4 + react-i18next; backend: Fastify + ws (signaling only).
- **Commands** — `pnpm install`; `pnpm dev` (frontend), `pnpm dev:playground`, `pnpm dev:server`; `pnpm -r build`; `pnpm lint` (Biome + Stylelint); `pnpm typecheck`; `pnpm test`.
- **Styling rule** — CSS Modules stay; Tailwind is frontend-only and themed off tokens via `@theme`; do **not** rewrite CSS Modules into Tailwind.
- **i18n rule** — react-i18next in the frontend, en + ru, catalogs under `apps/frontend/src/locales/`, **no string literals in `.tsx`**; `@release/ui` is i18n-agnostic and receives copy via props.
- **Architecture rule** — backend is P2P signaling/lobby only; game state lives on the peers; no game rules server-side.
- **UI consumption** — apps import `@release/ui` from source via Vite/tsconfig alias to `apps/ui/src`.

- [ ] **Step 2: Write `AGENTS.md` as a pointer**

```markdown
# AGENTS.md

This project's agent and contributor guidance lives in [CLAUDE.md](./CLAUDE.md).
Read it for the monorepo layout, per-app stack, commands, and the styling / i18n / architecture rules.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md AGENTS.md
git commit -m "docs: add CLAUDE.md project guide and AGENTS.md pointer"
```

---

## Task 11: Workspace-wide verification + cleanup

**Files:**
- Delete (verify gone): root `src/`, root `playground/`, root `index.html`, root `vite.config.js`, root `public/` (if now empty), `package-lock.json`
- Modify: any lingering reference to old paths

- [ ] **Step 1: Confirm no stale root app files remain**

Run: `ls index.html vite.config.js src playground 2>/dev/null; echo "---"; ls public 2>/dev/null`
Expected: first `ls` prints nothing (all moved). If `public/` is empty, `git rm -r public` (assets now live in `apps/ui/src/assets`).

- [ ] **Step 2: Fresh install from the lockfile**

Run: `pnpm install`
Expected: clean install; all four workspace packages linked.

- [ ] **Step 3: Workspace typecheck**

Run: `pnpm typecheck`
Expected: PASS for `@release/ui`, `@release/playground`, `@release/web`, `@release/server`.

- [ ] **Step 4: Workspace lint (Biome + Stylelint)**

Run: `pnpm lint`
Expected: PASS. Fix violations (run `pnpm format` for Biome auto-fixes; never change CSS visual values to satisfy Stylelint — adjust `.stylelintrc.json` rules instead if a rule fights the authored design).

- [ ] **Step 5: Workspace tests**

Run: `pnpm test`
Expected: PASS — ui Card smoke, backend session + server tests; playground/frontend pass-with-no-tests.

- [ ] **Step 6: Workspace build**

Run: `pnpm -r build`
Expected: PASS — playground + frontend emit `dist/`, backend compiles to `dist/`.

- [ ] **Step 7: Final dev smoke of all three apps**

Run each, confirm clean startup, Ctrl-C: `pnpm dev`, `pnpm dev:playground`, `pnpm dev:server` (hit `GET /healthz` → `{"status":"ok"}`).

- [ ] **Step 8: Commit any cleanup**

```bash
git add -A
git commit -m "chore: remove stale root app files, finalize monorepo layout"
```

- [ ] **Step 9: Push the branch (when ready for review)**

```bash
git push -u origin migration/monorepo-scaffold
```

---

## Notes on scope

This plan delivers structure, tooling, the TS migration, i18n wiring, and a working signaling server — **not** the game itself. The rules engine, the WebRTC peer client and state sync, and the full game screens (lobby → game → game over) are deliberately out of scope and become later specs that build on `@release/ui` and `@release/server`.
