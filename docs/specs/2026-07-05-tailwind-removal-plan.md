# Tailwind Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Tailwind from `apps/frontend` (`@release/web`) and restyle it with co-located CSS Modules + design tokens, porting the ui-kit screen styles (Start/Lobby as shown in the playground) as the visual source of truth.

**Spec:** [2026-07-05-tailwind-removal-design.md](./2026-07-05-tailwind-removal-design.md)

**Architecture:** Each frontend component/page gets a co-located `*.module.css` following ui-kit conventions (tokens via `var(--*)`, px spacing, logical properties, `composes` from the ui typography scale). Tailwind classes are replaced file by file while the Tailwind build keeps working; the tooling (deps, Vite plugin, stylelint allowances, `@theme` bridge) is removed in the last code task, then docs are updated.

**Tech Stack:** Vite 6, React 19, CSS Modules, stylelint (`stylelint-config-standard` + `stylelint-use-logical`), Biome, Vitest.

## Global Constraints

- Colors, fonts, gradients, timings **only** via tokens from `apps/ui/src/design/tokens.css` (`var(--mint)`, `var(--font-mono)`, `var(--grad-scrim)`…). Never a raw `#hex` / `rgb()`. Exception: mask-image alpha stops copied verbatim from ui-kit modules (they encode alpha, not color).
- Tailwind `fg/NN` opacities map to the nearest existing `--white-NN` token (`fg/15` → `--white-14`, `fg/80` → `--white-78`; exact matches exist for the rest). Tailwind `red-*` error styling maps to the `--coral` family.
- Spacing/sizing as plain px (Tailwind scale × 4: `p-6` → `24px`, `max-w-xl` → `576px`, `max-w-2xl` → `672px`, `max-w-sm` → `384px`, `max-w-md` → `448px`).
- Logical properties everywhere (`margin-block-start`, `padding-inline-end`, `inset-inline-end`) — stylelint `csstools/use-logical` enforces this. Shorthands copied verbatim from ui-kit modules are fine (they pass the same linter).
- Typography via `composes: <base> <tk-NN> from '@/design/typography.module.css'` (the `@` alias → `apps/ui/src`, already configured in `vite.config.ts` and `tsconfig.json`). **Fallback** if Vite fails to resolve the alias inside `composes` (check in Task 5): use a relative path, one `..` per directory level up to `apps/`, e.g. from `src/features/create-lobby/`: `../../../../ui/src/design/typography.module.css`.
- **Preflight loss:** removing Tailwind removes its CSS reset. `@release/ui/global.css` (already imported in `main.tsx`) only resets `html/body` and `box-sizing`. Every converted class on an `h*`, `p`, `ul`, `pre`, or `a` element must set its own `margin: 0` (or explicit margins) and, for links, `color` + `text-decoration`. The CSS in this plan already includes these — do not strip them.
- **Markup and behavior stay.** JSX structure, hooks, props, and translations do not change except: `className` values, the two markup adaptations named in Task 2 (lang-switch shade div) and Task 7 (`Button` header variant `danger` → `dangerGhost` to match the playground). HudBackground layers, credits, and PhysicalEdition from the ui screens are **not** added — that's the "consume ui screens" follow-up, out of scope.
- Every task ends with `pnpm --filter @release/web typecheck && pnpm --filter @release/web test` green (plus `pnpm --filter @release/web stylelint` once the task adds CSS) and a commit. Tailwind stays installed until Task 8.
- Work on the current branch (`feat/ui-iteration`). Commit messages follow the repo's conventional style (`refactor(web): …`).

---

### Task 1: Lobby status flow — `_ui.tsx` + `[lobbyId].tsx`

**Files:**
- Create: `apps/frontend/src/pages/lobby/_ui.module.css`
- Modify: `apps/frontend/src/pages/lobby/_ui.tsx`
- Modify: `apps/frontend/src/pages/lobby/[lobbyId].tsx`

**Interfaces:**
- Produces: `_ui.tsx` keeps exporting `label`, `ghostBtn`, `card` (now module class strings) and `Shell` — `[lobbyId].tsx` is the only consumer.

- [ ] **Step 1: Create the module**

```css
/* apps/frontend/src/pages/lobby/_ui.module.css */
/* Shared styling for the lobby status flow (/lobby/:lobbyId). */
.shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
  justify-content: center;
  max-inline-size: 576px;
  min-block-size: 100vh;
  padding: 80px 24px;
  margin-inline: auto;
}

.label {
  margin: 0;
  font-weight: 600;
  letter-spacing: var(--tracking);
  color: var(--white-70);
}

.ghostBtn {
  padding: 8px 16px;
  font-weight: 600;
  letter-spacing: var(--tracking);
  color: var(--white-78);
  text-decoration: none;
  cursor: pointer;
  border: 1px solid var(--white-14);
  border-radius: 8px;
  transition: background var(--t-fast) var(--ease-out);
}

.ghostBtn:hover {
  background: var(--white-06);
}

.ghostBtn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.card {
  padding: 24px;
  background: var(--surface-1);
  border: 1px solid var(--white-10);
  border-radius: 16px;
}

/* card contents stacked (interstitial / join card) */
.cardStack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.statusText {
  margin: 0;
  color: var(--white-78);
}

.backLink {
  display: inline-block;
  margin-block-start: 16px;
}

.backStart {
  align-self: flex-start;
}

.code {
  composes: code tk-10 from '@/design/typography.module.css';
  margin: 0;
  font-weight: 700;
  color: var(--brand-green);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.connecting {
  margin: 0;
  font-size: 14px;
  color: var(--white-60);
}

.joinTitle {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: var(--tracking);
}
```

Note: the old `hover:bg-surface-2` on `ghostBtn` referenced a theme color that was never bridged — the class was dead. `--white-06` gives it the intended subtle hover.

- [ ] **Step 2: Rewrite `_ui.tsx`**

```tsx
import type { ReactNode } from 'react'
import styles from './_ui.module.css'

// Shared styling for the lobby status flow (/lobby/:lobbyId) — the Shell, the
// card, and the back link around the join form / interstitial / status screens.
export const label = styles.label
export const ghostBtn = styles.ghostBtn
export const card = styles.card
export { styles }

export function Shell({ children }: { children: ReactNode }) {
  return <main className={styles.shell}>{children}</main>
}
```

- [ ] **Step 3: Update `[lobbyId].tsx` class usages**

Replace the four Tailwind spots (imports stay, add `styles` to the `_ui` import):

```tsx
import { card, ghostBtn, label, Shell, styles } from './_ui'
```

```tsx
// kicked / disbanded card:
<p className={styles.statusText}>
…
<Link to="/start" className={`${ghostBtn} ${styles.backLink}`} onClick={() => session.leaveSession()}>
```

```tsx
// interstitial:
<div className={`${card} ${styles.cardStack}`}>
  <div>
    <p className={label}>{t('lobby.activeSession')}</p>
    <p className={styles.code}>{session.roomCode}</p>
  </div>
  <div className={styles.row}>
```

```tsx
// join screen:
{session.status === 'connecting' && (
  <p className={styles.connecting}>{t('lobby.connecting')}</p>
)}
<div className={`${card} ${styles.cardStack}`}>
  <h2 className={styles.joinTitle}>{t('lobby.joinTitle')}</h2>
  <JoinLobbyForm />
</div>
<Link to="/start" className={`${ghostBtn} ${styles.backStart}`} onClick={() => session.leaveSession()}>
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @release/web typecheck && pnpm --filter @release/web stylelint && pnpm --filter @release/web test`
Expected: all pass. Then `pnpm dev`, open `/lobby/XXXX` (no session) — join card renders with border/padding, back link visible.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/lobby/
git commit -m "refactor(web): lobby status flow to CSS Modules (#47)"
```

---

### Task 2: App shell — `_app.tsx` + `LanguageSwitch`

**Files:**
- Create: `apps/frontend/src/app/app.module.css`
- Create: `apps/frontend/src/shared/ui/LanguageSwitch.module.css`
- Modify: `apps/frontend/src/pages/_app.tsx`
- Modify: `apps/frontend/src/shared/ui/LanguageSwitch.tsx`

**Interfaces:**
- Produces: nothing consumed elsewhere; `LanguageSwitch` keeps its zero-prop API.

- [ ] **Step 1: Create `app.module.css`**

```css
/* apps/frontend/src/app/app.module.css */
.root {
  min-block-size: 100vh;
  color: var(--fg);
  background: var(--bg);
}

.homeLink {
  position: fixed;
  inset-block-start: 16px;
  inset-inline-start: 16px;
  z-index: 10;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: var(--tracking);
  color: var(--brand-green);
  text-decoration: none;
  background: var(--surface-1);
  border: 1px solid var(--white-10);
  border-radius: 8px;
  transition: opacity var(--t-fast) var(--ease-out);
}

.homeLink:hover {
  opacity: 0.8;
}
```

- [ ] **Step 2: Update `_app.tsx`**

Add `import styles from '~/app/app.module.css'`; replace the wrapper div's class with `className={styles.root}` and the home `Link`'s class list with `className={styles.homeLink}`.

- [ ] **Step 3: Create `LanguageSwitch.module.css`** — ported from `apps/ui/src/screens/Start/Start.module.css` `.langCorner`/`.langShade` (fixed instead of absolute: the switch is viewport-level here, same visual on the full-screen start page):

```css
/* apps/frontend/src/shared/ui/LanguageSwitch.module.css */
.corner {
  position: fixed;
  inset-block-start: 72px;
  inset-inline-end: 76px;
  z-index: 10;
}

/* soft corner darkening under the switcher — the start photo is light and
   busy on the right; ported from the ui Start screen */
.shade {
  position: fixed;
  inset-block-start: 0;
  inset-inline-end: 0;
  z-index: 9;
  inline-size: 340px;
  block-size: 200px;
  pointer-events: none;
  background: var(--grad-corner-shade);
}
```

- [ ] **Step 4: Update `LanguageSwitch.tsx`** (the shade div is the sanctioned markup adaptation from the spec — the playground start screen has it):

```tsx
import { useTranslation } from '@release/translation'
import { LangSwitcher, type SwitchLang } from '@release/ui'
import styles from './LanguageSwitch.module.css'

// Frontend adapter for the i18n-agnostic LangSwitcher block: binds it to
// react-i18next and fixes it to the top-right corner (position + corner shade
// ported from the ui Start screen so it matches the playground).
export default function LanguageSwitch() {
  const { i18n } = useTranslation()
  const value: SwitchLang = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'
  return (
    <>
      <div className={styles.shade} />
      <div className={styles.corner}>
        <LangSwitcher value={value} onChange={(lang) => i18n.changeLanguage(lang)} />
      </div>
    </>
  )
}
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @release/web typecheck && pnpm --filter @release/web stylelint && pnpm --filter @release/web test`
Expected: all pass (`LanguageSwitch.test.tsx` is behavioral — if it asserts on the wrapper structure, update the selector, not the behavior). In `pnpm dev`: home link appears on `/help`, lang switch top-right on `/start` with corner shade.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/app/app.module.css apps/frontend/src/pages/_app.tsx apps/frontend/src/shared/ui/LanguageSwitch*
git commit -m "refactor(web): app shell + language switch to CSS Modules (#47)"
```

---

### Task 3: `ErrorScreen`

**Files:**
- Create: `apps/frontend/src/shared/ui/ErrorScreen.module.css`
- Modify: `apps/frontend/src/shared/ui/ErrorScreen.tsx`

- [ ] **Step 1: Create the module**

```css
/* apps/frontend/src/shared/ui/ErrorScreen.module.css */
.root {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: center;
  justify-content: center;
  min-block-size: 100vh;
  padding: 24px;
  color: var(--fg);
  text-align: center;
  background: var(--bg);
}

.text {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: var(--tracking);
}

.desc {
  max-inline-size: 384px;
  margin: 0;
  font-size: 14px;
  color: var(--white-60);
}

.detail {
  max-inline-size: 448px;
  padding: 12px;
  margin: 0;
  overflow: auto;
  font-size: 12px;
  color: var(--white-70);
  text-align: start;
  background: var(--surface-1);
  border: 1px solid var(--white-10);
  border-radius: 6px;
}

.actions {
  display: inline-flex;
  gap: 8px;
}
```

- [ ] **Step 2: Update `ErrorScreen.tsx`**

`import styles from './ErrorScreen.module.css'`; map: root div → `styles.root`, inner div → `styles.text`, `h1` → `styles.title`, `p` → `styles.desc`, `pre` → `styles.detail`, buttons wrapper → `styles.actions`.

- [ ] **Step 3: Verify + commit**

Run: `pnpm --filter @release/web typecheck && pnpm --filter @release/web stylelint && pnpm --filter @release/web test`
Expected: pass, including `ErrorScreen.test.tsx`.

```bash
git add apps/frontend/src/shared/ui/ErrorScreen*
git commit -m "refactor(web): ErrorScreen to CSS Modules (#47)"
```

---

### Task 4: `help.tsx`

**Files:**
- Create: `apps/frontend/src/pages/help.module.css`
- Modify: `apps/frontend/src/pages/help.tsx`

- [ ] **Step 1: Create the module**

```css
/* apps/frontend/src/pages/help.module.css */
.page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-inline-size: 672px;
  padding: 64px 24px;
  margin-inline: auto;
}

.title {
  margin: 0;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: var(--tracking);
}

.back {
  color: var(--brand-green);
  text-decoration: underline;
}
```

- [ ] **Step 2: Update `help.tsx`** — `main` → `styles.page`, `h1` → `styles.title`, `Link` → `styles.back`.

- [ ] **Step 3: Verify + commit**

Run: `pnpm --filter @release/web typecheck && pnpm --filter @release/web stylelint && pnpm --filter @release/web test`

```bash
git add apps/frontend/src/pages/help*
git commit -m "refactor(web): help page to CSS Modules (#47)"
```

---

### Task 5: Forms — `CreateLobbyForm` + `JoinLobbyForm`

Style source: `apps/ui/src/screens/Start/Start.module.css` (`.createGrid`, `.createMods`, `.createTech`, `.techTitle`, `.note`) — the create modal in the playground.

**Files:**
- Create: `apps/frontend/src/features/create-lobby/CreateLobbyForm.module.css`
- Create: `apps/frontend/src/features/join-lobby/JoinLobbyForm.module.css`
- Modify: `apps/frontend/src/features/create-lobby/CreateLobbyForm.tsx`
- Modify: `apps/frontend/src/features/join-lobby/JoinLobbyForm.tsx`

- [ ] **Step 1: Create `CreateLobbyForm.module.css`** (ported)

```css
/* apps/frontend/src/features/create-lobby/CreateLobbyForm.module.css */
/* Ported from apps/ui/src/screens/Start/Start.module.css (create modal). */
.createGrid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.85fr);
  align-items: stretch;
}

.createMods {
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding-inline-end: 36px;
}

.createTech {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-inline-start: 36px;
  border-inline-start: 1px solid var(--white-08);
}

.techTitle {
  composes: subtitle tk-02 from '@/design/typography.module.css';
  margin: 0;
  color: var(--fg);
}

.note {
  composes: body-sm from '@/design/typography.module.css';
  margin: auto 0 0;
  line-height: 1.55;
  color: var(--white-50);
}

.error {
  padding: 12px 16px;
  margin: 0;
  font-size: 14px;
  color: var(--coral);
  background: var(--coral-12);
  border: 1px solid var(--coral-45);
  border-radius: 8px;
}
```

Note: the old `font-heading` utility on the `h4` was never bridged into `@theme` — dead class; `composes: subtitle` restores the intended Onest 16px, matching the playground. The error banner moves from Tailwind's `red-500` palette to the `--coral` family (tokens-only rule).

- [ ] **Step 2: Update `CreateLobbyForm.tsx`** — `import styles from './CreateLobbyForm.module.css'`; map: grid div → `styles.createGrid`, left col → `styles.createMods`, right col → `styles.createTech`, `h4` → `styles.techTitle`, error `p` → `styles.error`, note `p` → `styles.note`.

- [ ] **Step 3: Create `JoinLobbyForm.module.css`**

```css
/* apps/frontend/src/features/join-lobby/JoinLobbyForm.module.css */
.form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.error {
  padding: 12px 16px;
  margin: 0;
  font-size: 14px;
  color: var(--coral);
  background: var(--coral-12);
  border: 1px solid var(--coral-45);
  border-radius: 8px;
}
```

(The 7-line `.error` is duplicated between the two feature modules on purpose — features don't share private CSS; extracting a shared error block into `@release/ui` is follow-up territory.)

- [ ] **Step 4: Update `JoinLobbyForm.tsx`** — `import styles from './JoinLobbyForm.module.css'`; `Form className={styles.form}`, error `p` → `styles.error`.

- [ ] **Step 5: Verify `composes` across packages**

Run: `pnpm dev`, open `/start` → create modal. The "lobby params" heading must render in Onest 16px (inspect: `font-family` from `--font-heading`).
If Vite errors on the `composes … from '@/design/typography.module.css'` path, switch both modules to the relative form `../../../../ui/src/design/typography.module.css` (see Global Constraints) and re-verify.

- [ ] **Step 6: Verify + commit**

Run: `pnpm --filter @release/web typecheck && pnpm --filter @release/web stylelint && pnpm --filter @release/web test`

```bash
git add apps/frontend/src/features/
git commit -m "refactor(web): lobby forms to CSS Modules, port create-modal styles (#47)"
```

---

### Task 6: Start page — `start.tsx` + test

Style source: `apps/ui/src/screens/Start/Start.module.css`. This intentionally changes the layout: content top-aligned at 72/76px (currently vertically centered), description margin 96px (currently 72px), menu column 300px wide. That drift is what #47 is about.

**Files:**
- Create: `apps/frontend/src/pages/start.module.css`
- Modify: `apps/frontend/src/pages/start.tsx`
- Modify: `apps/frontend/src/pages/__tests__/start.test.tsx`

- [ ] **Step 1: Create `start.module.css`** (ported; `.bg` url uses the `@` alias — Vite resolves aliases in CSS `url()`; mask stops copied verbatim from the ui module)

```css
/* apps/frontend/src/pages/start.module.css */
/* Ported from apps/ui/src/screens/Start/Start.module.css. */
.root {
  position: relative;
  inline-size: 100%;
  block-size: 100vh;
  overflow: hidden;
  background: var(--bg);
}

.bg {
  position: absolute;
  inset: 0;
  background-image: url("@/assets/home/photo.jpg");
  background-position: center right;
  background-size: cover;
}

/* blur stronger on the left, fading to the right edge (via mask) */
.blur {
  position: absolute;
  inset: 0;
  -webkit-backdrop-filter: blur(11px);
  backdrop-filter: blur(11px);
  -webkit-mask-image: linear-gradient(90deg, #000 0%, rgb(0 0 0 / 70%) 38%, transparent 66%);
  mask-image: linear-gradient(90deg, #000 0%, rgb(0 0 0 / 70%) 38%, transparent 66%);
}

.scrim {
  position: absolute;
  inset: 0;
  background: var(--grad-scrim);
}

.content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  block-size: 100%;
  padding-block-start: 72px;
  padding-inline-start: 76px;
}

.col {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  inline-size: 460px;
}

.logo {
  inline-size: 480px;
  block-size: auto;

  /* compensate the glyph glow/inset in the SVG — "R" on the left line */
  margin: 0 0 12px -11px;
}

.tags {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-block-end: 38px;
  color: var(--cat-release);
  opacity: 0.85;
}

.desc {
  margin-block-end: 96px;
}

.menu {
  align-self: flex-start;
  inline-size: 300px;
  margin-inline-start: -11px;
}

/* reserved continue-session slot, hidden without a session */
.hiddenSlot {
  pointer-events: none;
  visibility: hidden;
}
```

- [ ] **Step 2: Update `start.tsx`**

`import styles from './start.module.css'`. Class mapping (structure unchanged):

```tsx
<div className={styles.root}>
  <div className={styles.bg} />
  <div className={styles.blur} />
  <div className={styles.scrim} />

  <div className={styles.content}>
    <div className={styles.col}>
      <AppLogo className={styles.logo} />

      <div className={styles.tags}>
        <Typography variant="tag">{t('start.tagOpenP2P')}</Typography>
        <Typography variant="tag">{t('start.tagBoardCard')}</Typography>
      </div>

      <Typography variant="body" className={styles.desc}>
        {t('start.description')}
      </Typography>

      <Menu className={styles.menu}>
        …
        <MenuButton
          aria-hidden={!hasSession}
          disabled={!hasSession}
          className={hasSession ? undefined : styles.hiddenSlot}
          …
```

(The extra scrim/blur divs collapse from three utility divs to the same three divs with module classes; the `start-blur-mask` / `start-scrim` `@utility` blocks in `index.css` become unused — removed in Task 8.)

- [ ] **Step 3: Update `start.test.tsx`**

The two assertions on the Tailwind `invisible` class must use the module class. Add at the top:

```tsx
import styles from '../start.module.css'
```

and replace:

```tsx
expect(btn?.className ?? '').not.toContain(styles.hiddenSlot)
…
expect(btn?.className ?? '').toContain(styles.hiddenSlot)
```

(Vitest's default CSS-module handling returns stable class names, so this works without extra config.)

- [ ] **Step 4: Verify + commit**

Run: `pnpm --filter @release/web typecheck && pnpm --filter @release/web stylelint && pnpm --filter @release/web test`
Expected: pass, including the two updated start assertions. In `pnpm dev:all`, compare `/start` against the playground `StartStory`: top-left content block, tag colors, description width, menu width must match. Known intentional gaps vs the story: no HUD grid layer, no credits, no PhysicalEdition plate (out of scope, see Global Constraints).

```bash
git add apps/frontend/src/pages/start* apps/frontend/src/pages/__tests__/start.test.tsx
git commit -m "refactor(web): start page to CSS Modules, port ui Start layout (#47)"
```

---

### Task 7: Lobby view — `_LobbyView.tsx`

Style sources: `apps/ui/src/screens/Lobby/Lobby.module.css`, `apps/ui/src/blocks/PlayerSlot/PlayerSlot.module.css`, `apps/ui/src/blocks/LobbyCode/LobbyCode.module.css`. The kebab menu is frontend-only markup — its styles convert with tokens (the `#8fd9b0`/`#ff6b81` hardcodes become `--mint`/`--coral`, exact same values).

**Files:**
- Create: `apps/frontend/src/pages/lobby/_LobbyView.module.css`
- Modify: `apps/frontend/src/pages/lobby/_LobbyView.tsx`

- [ ] **Step 1: Create `_LobbyView.module.css`**

```css
/* apps/frontend/src/pages/lobby/_LobbyView.module.css */
/* Ported from apps/ui/src/screens/Lobby/Lobby.module.css and the PlayerSlot /
   LobbyCode block modules; the kebab menu is frontend-only markup. */
.lobby {
  position: relative;
  display: flex;
  flex-direction: column;
  inline-size: 100%;
  block-size: 100vh;
  padding: 48px clamp(40px, 7vw, 96px);
  overflow: hidden;
  color: var(--fg);
  background: var(--bg);
}

/* ===== header ===== */
.head {
  display: flex;
  gap: 32px;
  align-items: flex-start;
  justify-content: space-between;
  padding-block-end: 28px;
  border-block-end: 1px solid var(--white-08);
}

.titleRow {
  display: flex;
  gap: 18px;
  align-items: center;
}

.headLogo {
  flex: none;
  inline-size: 96px;
}

.headDivider {
  inline-size: 1px;
  block-size: 30px;
  background: var(--white-20);
}

.title {
  composes: heading-3 tk-04 from '@/design/typography.module.css';
  margin: 0;
}

.sub {
  composes: label tk-14 from '@/design/typography.module.css';

  /* aligned under the word "Lobby": logo 96 + gap 18 + divider 1 + gap 18 */
  margin: 6px 0 0 133px;
  color: var(--white-45);
}

/* right side of the header: game code (LobbyCode-style column) */
.codeBox {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.codeLabel {
  composes: label-sm tk-16 from '@/design/typography.module.css';
  color: var(--white-45);
}

.codeRow {
  display: flex;
  gap: 14px;
  align-items: center;
}

.codeValue {
  composes: code tk-20 from '@/design/typography.module.css';
  color: var(--mint);
}

.copyBtn {
  composes: label-sm tk-12 from '@/design/typography.module.css';
  padding: 7px 12px;
  color: var(--white-70);
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--white-18);
  transition: color var(--t-fast) var(--ease-out), border-color var(--t-fast) var(--ease-out);
}

.copyBtn:hover {
  color: var(--fg);
  border-color: var(--white-55);
}

/* ===== content: modes left, players right ===== */
.grid {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
  gap: 48px;
  min-block-size: 0;
  padding: 32px 0;
}

.h {
  composes: heading-8 tk-04 from '@/design/typography.module.css';
  display: flex;
  gap: 12px;
  align-items: baseline;
  margin: 0 0 20px;
}

.count {
  composes: mono-md tk-10 from '@/design/typography.module.css';
  color: var(--white-45);
}

.lockTag {
  composes: mono-xs tk-10 from '@/design/typography.module.css';
  color: var(--white-40);
  text-transform: none;
}

.modes {
  display: flex;
  flex-direction: column;
  min-block-size: 0;
}

.modeList {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding-inline-end: 8px;
  overflow-y: auto;
}

/* ===== players column ===== */
.players {
  display: flex;
  flex-direction: column;
  min-block-size: 0;
}

.scrollArea {
  flex: 1;
  min-block-size: 0;
  padding-inline-end: 8px;
  overflow-y: auto;
}

.hSpectators {
  margin-block-start: 30px;
}

.capRow {
  margin-block-end: 18px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
}

/* player / spectator rows — ported from PlayerSlot */
.slot,
.slotEmpty {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  border: 1px solid var(--white-10);
}

.slot {
  background: var(--white-04);
}

.slotMe {
  border-color: var(--mint-50);
}

.name {
  composes: body-lg from '@/design/typography.module.css';
}

.you {
  composes: body-sm from '@/design/typography.module.css';
  color: var(--white-40);
}

.rowEnd {
  position: relative;
  display: flex;
  gap: 10px;
  align-items: center;
  margin-inline-start: auto;
}

.slotEmpty {
  composes: label tk-12 from '@/design/typography.module.css';
  color: var(--white-30);
  border-style: dashed;
}

/* ===== kebab menu (frontend-only) ===== */
.kebabWrap {
  position: relative;
  display: flex;
}

.kebabBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  inline-size: 28px;
  block-size: 28px;
  font-size: 18px;
  line-height: 1;
  color: var(--white-50);
  cursor: pointer;
  background: transparent;
  border: 0;
  transition: color var(--t-fast) var(--ease-out);
}

.kebabBtn:hover {
  color: var(--fg);
}

.kebabMenu {
  position: absolute;
  inset-block-start: calc(100% + 6px);
  inset-inline-end: 0;
  z-index: 5;
  inline-size: max-content;
  background: color-mix(in srgb, var(--surface-1) 96%, var(--bg));
  border: 1px solid var(--white-14);
  box-shadow: 0 16px 40px var(--black-50);
}

.kebabItem {
  composes: body-sm from '@/design/typography.module.css';
  display: block;
  inline-size: 100%;
  padding: 11px 18px;
  color: var(--white-85);
  text-align: start;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
  transition: color var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out);
}

.kebabItem:hover {
  color: var(--fg);
  background: var(--white-08);
}

.kebabDanger {
  color: var(--coral);
}

.kebabDanger:hover {
  color: var(--coral);
  background: var(--coral-12);
}

/* ===== lobby actions ===== */
.actions {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: center;
  padding-block-start: 22px;
  margin-block-start: 22px;
  border-block-start: 1px solid var(--white-08);
}

/* ===== disband confirmation modal ===== */
.confirmText {
  composes: body-lg from '@/design/typography.module.css';
  margin: 0;
  color: var(--white-75);
}

.confirmActions {
  display: flex;
  gap: 18px;
  justify-content: flex-end;
  margin-block-start: auto;
}
```

- [ ] **Step 2: Update `_LobbyView.tsx`**

`import styles from './_LobbyView.module.css'`. Class mapping, top to bottom (JSX structure unchanged):

| Old Tailwind element | New class |
|---|---|
| root div | `styles.lobby` |
| `header` | `styles.head` |
| logo+title row div | `styles.titleRow` |
| `<AppLogo className="w-24 flex-none">` | `styles.headLogo` |
| divider `span` | `styles.headDivider` |
| `h1` | `styles.title` |
| subtitle `p` | `styles.sub` |
| code column div | `styles.codeBox` |
| code label `span` | `styles.codeLabel` |
| code row div | `styles.codeRow` |
| room-code `span` | `styles.codeValue` |
| copy `button` | `styles.copyBtn` |
| two-column grid div | `styles.grid` |
| left `section` | `styles.modes` |
| both section `h2` | `styles.h` (spectators heading: `` `${styles.h} ${styles.hSpectators}` ``) |
| locked hint `span` | `styles.lockTag` |
| counts `span` | `styles.count` |
| mode list div | `styles.modeList` |
| right `section` | `styles.players` |
| scroll div | `styles.scrollArea` |
| `<Slider className="mb-[18px]">` | `styles.capRow` |
| both `ul` | `styles.list` |
| player `li` | `` `${styles.slot} ${p.id === state.selfId ? styles.slotMe : ''}` `` |
| empty/no-spectators `li` | `styles.slotEmpty` |
| name `span` | `styles.name` |
| "(you)" `span` | `styles.you` |
| status+menu div | `styles.rowEnd` |
| kebab wrapper div (in `renderMenu`) | `styles.kebabWrap` |
| kebab `button` | `styles.kebabBtn` |
| dropdown div | `styles.kebabMenu` |
| dropdown item `button` | `` `${styles.kebabItem} ${it.danger ? styles.kebabDanger : ''}` `` |
| bottom actions div | `styles.actions` |
| modal `p` | `styles.confirmText` |
| modal buttons div | `styles.confirmActions` |

Also change the header disband button variant to match the playground: `<Button variant="dangerGhost" …>` (was `danger`) — the one sanctioned prop change.

- [ ] **Step 3: Verify + commit**

Run: `pnpm --filter @release/web typecheck && pnpm --filter @release/web stylelint && pnpm --filter @release/web test`
Expected: pass. In `pnpm dev:all` create a lobby and compare against the playground `LobbyStory` (host + guest): header alignment, code block, slot rows, section headings, bottom actions. Kebab menu opens with the dark dropdown; danger item is coral. Known intentional gaps vs the story: no HUD background layer, no in-screen lang switcher, no spectator-limit slider, kebab instead of PlayerSlot's dropdown (frontend behavior kept).

```bash
git add apps/frontend/src/pages/lobby/_LobbyView*
git commit -m "refactor(web): lobby view to CSS Modules, port ui Lobby styles (#47)"
```

---

### Task 8: Remove Tailwind tooling

Only after Tasks 1–7: nothing imports Tailwind utilities anymore.

**Files:**
- Modify: `apps/frontend/src/app/index.css`
- Modify: `apps/frontend/vite.config.ts`
- Modify: `apps/frontend/package.json`
- Modify: `packages/lint/stylelint.config.json`

- [ ] **Step 1: Rewrite `index.css`** — drop the Tailwind import, `@theme` bridge, and both `@utility` blocks; keep only the view-transition CSS:

```css
/* Lobby→board slide via the native View Transitions API. The helper guards
   reduced motion in JS; this also disables the animation at the CSS layer. */
@keyframes vt-slide-out-left {
  to {
    opacity: 0;
    transform: translateX(-3%);
  }
}

@keyframes vt-slide-in-right {
  from {
    opacity: 0;
    transform: translateX(3%);
  }
}

::view-transition-old(root) {
  animation: 220ms ease both vt-slide-out-left;
}

::view-transition-new(root) {
  animation: 240ms ease both vt-slide-in-right;
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none;
  }
}
```

- [ ] **Step 2: Remove the Vite plugin** — in `apps/frontend/vite.config.ts` delete `import tailwindcss from '@tailwindcss/vite'` and the `tailwindcss(),` entry in `plugins`.

- [ ] **Step 3: Remove the deps**

```bash
pnpm --filter @release/web remove tailwindcss @tailwindcss/vite
```

- [ ] **Step 4: Clean the stylelint config** — in `packages/lint/stylelint.config.json` replace the `at-rule-no-unknown` override with the plain rule (no Tailwind at-rules left anywhere):

```json
"at-rule-no-unknown": true,
```

- [ ] **Step 5: Verify the removal is total**

```bash
grep -ri tailwind --include='*.{ts,tsx,css,json}' apps packages | grep -v node_modules
```

Expected: no output.

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: all green — `pnpm lint` runs Biome **and** per-package stylelint over all the new modules with the stricter at-rule config; `pnpm build` proves Vite compiles without the plugin.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/app/index.css apps/frontend/vite.config.ts apps/frontend/package.json packages/lint/stylelint.config.json pnpm-lock.yaml
git commit -m "chore(web): remove tailwind toolchain (#47)"
```

---

### Task 9: Docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `apps/frontend/CLAUDE.md`
- Modify: `README.md`
- Modify: `.claude/agent/engineering/engineering-frontend-developer.md`

- [ ] **Step 1: Root `CLAUDE.md`**

- Overview: "…the UI component library, and the Tailwind-themed frontend shell" → "…the UI component library, and the frontend shell".
- Monorepo Layout row for `apps/frontend`: "Main web app — Vite + React + Tailwind v4 + react-i18next" → "Main web app — Vite + React + CSS Modules + react-i18next".
- Stack Per App / `@release/web`: delete the "**Tailwind v4** via `@tailwindcss/vite` plugin" and "Tailwind tokens bridged…via `@theme`" bullets; add "CSS Modules for component styles, design tokens via `@release/ui/tokens.css`".
- Replace the whole **Styling Rule** section body with:

```markdown
Styling is uniform across all packages: **CSS Modules + design tokens.**

- Every styled component/page has a co-located `*.module.css`. Colors, fonts,
  gradients, timings come from the design tokens in
  [`apps/ui/src/design/tokens.css`](./apps/ui/src/design/tokens.css) via
  `var(--*)` — never hardcode a color (`#hex`, `rgb()`, named). Missing a
  color → add a token there first.
- Typography composes from the shared scale:
  `composes: <base> <tk-NN> from '@/design/typography.module.css'`
  (see [`apps/ui/src/design/typography.module.css`](./apps/ui/src/design/typography.module.css)).
- Spacing/sizing are plain px values; use logical properties
  (`padding-inline`, `margin-block-start`) — stylelint enforces this.
- **No Tailwind anywhere** — removed in
  [#47](https://github.com/MythHand/ReleaseBoardGameP2P/issues/47); stylelint
  rejects its at-rules. For the screens the ui-kit also ships
  (`screens/Start`, `screens/Lobby`), the ui-kit styles are the visual source
  of truth — check the playground before restyling the frontend.
```

- [ ] **Step 2: `apps/frontend/CLAUDE.md`**

- Header paragraph: "styling (Tailwind-only)" → "styling (CSS Modules + tokens)".
- Rule "All visuals come from `@release/ui`. Pages add layout/Tailwind only — never new visual components, never `*.module.css`." → "All visuals come from `@release/ui`. Pages add layout via co-located `*.module.css` files only — never new visual components."
- Rule "Colors are design tokens only." — rewrite the mechanism: drop "Tailwind arbitrary values" and the `@theme` bridge sentence; colors come from `var(--*)` tokens in module CSS; missing a color → add a token to `apps/ui/src/design/tokens.css`.
- Typography rule: drop "never Tailwind font/size/tracking utilities on text" → "never raw font/size/tracking declarations outside `composes` from the shared typography scale".

- [ ] **Step 3: `README.md` + agent doc** — apply the same substitutions wherever Tailwind is mentioned (grep from Task 8 Step 5 must stay clean; run it again scoped to `*.md`):

```bash
grep -ri tailwind --include='*.md' . | grep -v node_modules | grep -v docs/specs
```

Expected: no output (specs keep their historical mentions).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md apps/frontend/CLAUDE.md README.md .claude/agent/engineering/engineering-frontend-developer.md
git commit -m "docs: styling rule — CSS Modules + tokens, tailwind removed (#47)"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full checks**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: all green.

- [ ] **Step 2: Side-by-side manual review** (per spec — the reference is the playground, not the old Tailwind look)

Run `pnpm dev:all`, then walk:

1. `/start` vs playground `StartStory` — layout block top-left at 72/76, tags, description, 300px menu; lang switch top-right with corner shade; video player.
2. Create modal vs the story's create modal — two-column grid, Onest section title, note pinned to the bottom.
3. Join modal — fields + CTA; error banner (force a bad code) renders coral.
4. `/lobby/:id` as host and as guest vs `LobbyStory` — header, code block, slots, ready toggle/badges, kebab menu, disband modal.
5. `/lobby/:id` without a session — join card; kicked/disbanded interstitials.
6. `/help`, error screen (throw in dev), 404 redirect.

Known intentional differences (markup out of scope, candidate follow-up issue: "frontend consumes ui-kit screens"): no HUD background layers, no credits/PhysicalEdition on start, no in-lobby lang switcher, no spectator-limit slider, kebab menu instead of PlayerSlot dropdown.

- [ ] **Step 3: Close out** — report findings; file the follow-up issue if the user wants it.
