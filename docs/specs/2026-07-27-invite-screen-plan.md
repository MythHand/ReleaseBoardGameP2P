# Invite Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `/lobby/:lobbyId` with the invite screen design across all five reachable states, on a screen frame shared with `/start`.

**Architecture:** `apps/ui/src/screens/` is a **design mockup**, not a dependency — it is read as the reference for what to build and is never imported or modified. The frontend gets its own `ScreenShell` in `shared/ui/`, composed from `@release/ui` *primitives and blocks* (the layer the frontend already consumes), and both `/start` and the invite screen render through it.

**Tech Stack:** React 19, TypeScript, CSS Modules + design tokens, `@release/ui` primitives, `@release/translation` (i18next), PeerJS transport, Vitest + Testing Library, Biome + Stylelint.

Design: [`docs/specs/2026-07-27-invite-screen-design.md`](./2026-07-27-invite-screen-design.md). Where that document says the frontend consumes `@release/ui`'s `Invite` screen, **this plan supersedes it**: the frontend implements the screen itself, per the same precedent as `pages/start.tsx` and `pages/lobby/_LobbyView.tsx`. Everything else in the design — the state machine, the error classification, the layout measurements, the copy decisions — still governs.

## Global Constraints

- **`apps/ui/` is not modified by this plan.** `apps/ui/src/screens/Start/` and `.../Invite/` are the visual reference. Read them; never import from `@release/ui/…/screens` and never edit them. The playground stories stay as they are.
- Visuals are composed from `@release/ui` **primitives and blocks** — `Button`, `Input`, `Spinner`, `Typography`, `HudBackground`, `LangSwitcher`, `PhysicalEdition`, `Menu`. That is the layer `pages/start.tsx` and `_LobbyView.tsx` already consume.
- **All text renders through `<Typography>`** from `@release/ui` — never a raw `<p>` / `<span>` / `<h1>` / `<h2>`, never hand-written font declarations, and **never `composes:` from the typography scale** in frontend module CSS. The mockup's `composes: X tk-Y` lines convert to `<Typography base="X" tk="tk-Y">` (see the conversion table in Task 6).
- Colors are design tokens only — `var(--*)`. Never a `#hex`, `rgb()`, `hsl()` or named color.
- **Every form uses `<Form>` from `~/shared/ui/Form`** with `<FormField>` for its inputs — never a raw `<form>`. `Form` already supplies required-field validation and the shake feedback (`play('shake', …)`), which is what the mockup hand-rolls.
- All user-visible strings go through `t()` with keys in **both** `packages/translation/src/locales/en/common.json` and `…/ru/common.json`.
- Layering: a module imports only from layers below it (`app` → `pages` → `features` → `entities` → `shared`, plus `network` via `entities`/`features`). Use the `~` alias for `src`, `@` for `@release/ui` source.
- Files under `pages/` starting with `_` are ignored by generouted. Page tests live in `__tests__/`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` pass before every commit. The pre-commit hook runs typecheck.
- Branch: `invite-screen-design`.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `apps/frontend/src/shared/ui/ScreenShell.tsx` | Screen frame: background layers, lang corner, left column (logo/tags/description); column body via `children` |
| `apps/frontend/src/shared/ui/ScreenShell.module.css` | Its layout |
| `apps/frontend/src/shared/ui/ScreenShell.test.tsx` | Children, conditional lang corner, conditional printed-edition block |
| `apps/frontend/src/pages/lobby/_InviteScreen.tsx` | The invite screen — frame + form + role control + action slot + home |
| `apps/frontend/src/pages/lobby/_InviteScreen.module.css` | Form, fields, role control, action slot, home |
| `apps/frontend/src/pages/lobby/__tests__/inviteScreen.test.tsx` | State derivation + behaviour |

**Modified**

| File | Change |
|---|---|
| `apps/frontend/src/pages/start.tsx` | Composes `ScreenShell` |
| `apps/frontend/src/pages/start.module.css` | Chrome + column rules deleted; `.menu` regains its gap at the new offset |
| `apps/frontend/src/network/useLobby.ts` | `errorKind`; `joinRoom` closes an existing transport |
| `apps/frontend/src/network/useLobby.test.ts` | Covers both |
| `apps/frontend/src/entities/lobby/index.ts` | Re-exports `ErrorKind` |
| `apps/frontend/src/pages/lobby/[lobbyId].tsx` | Renders `_InviteScreen` |
| `apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx` | Four pre-session tests rewritten; `base()` gains `errorKind` |
| `packages/translation/src/locales/{en,ru}/common.json` | `invite.*` block |

---

## Task 1: `ScreenShell`

**Files:**
- Create: `apps/frontend/src/shared/ui/ScreenShell.tsx`
- Create: `apps/frontend/src/shared/ui/ScreenShell.module.css`
- Test: `apps/frontend/src/shared/ui/ScreenShell.test.tsx`

**Reference:** `apps/ui/src/screens/Invite/Invite.module.css` (rules `.root` through `.desc`, plus `.physical`) and `apps/ui/src/screens/Invite/Invite.tsx` (the JSX above `{/* область 2 */}`). Read them; copy the values, not the file.

**Interfaces:**
- Consumes: `HudBackground`, `LangSwitcher`, `PhysicalEdition`, `Typography` and the types `SwitchLang` / `PhysicalEditionCopy` from `@release/ui`; `AppLogo` from `~/shared/ui/AppLogo` (it already binds `ReleaseLogo` to the active language).
- Produces:
  ```ts
  interface ScreenShellProps {
    tags: string[]
    description: string
    lang?: SwitchLang
    onLangChange?: (lang: SwitchLang) => void
    physicalEditionCopy?: PhysicalEditionCopy
    corners?: ReactNode
    children?: ReactNode
  }
  ```
  No `logoAlt` — `AppLogo` derives its variant from i18n and takes no alt.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/shared/ui/ScreenShell.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import ScreenShell from './ScreenShell'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { resolvedLanguage: 'en' } }),
}))

const PHYSICAL = {
  title: 'Printed edition',
  lead: 'lead',
  order: 'order',
  linkLabel: 'on Instagram',
  imageAlt: 'box',
}

it('renders the column body passed as children', () => {
  const { getByText } = render(
    <ScreenShell tags={['tag one']} description="A description.">
      <button type="button">Column body</button>
    </ScreenShell>,
  )
  expect(getByText('Column body')).toBeTruthy()
})

it('renders the tags and the description', () => {
  const { getByText } = render(
    <ScreenShell tags={['tag one', 'tag two']} description="A description." />,
  )
  expect(getByText('tag one')).toBeTruthy()
  expect(getByText('tag two')).toBeTruthy()
  expect(getByText('A description.')).toBeTruthy()
})

it('draws the language corner only when both lang and onLangChange are given', () => {
  const { queryByText, rerender } = render(
    <ScreenShell tags={[]} description="d" lang="ru" />,
  )
  expect(queryByText('ru')).toBeNull()

  rerender(<ScreenShell tags={[]} description="d" lang="ru" onLangChange={() => {}} />)
  expect(queryByText('ru')).toBeTruthy()
})

it('draws the printed-edition block only when its copy is given', () => {
  const { queryByText, rerender } = render(<ScreenShell tags={[]} description="d" />)
  expect(queryByText('Printed edition')).toBeNull()

  rerender(<ScreenShell tags={[]} description="d" physicalEditionCopy={PHYSICAL} />)
  expect(queryByText('Printed edition')).toBeTruthy()
})

it('renders extra corner blocks', () => {
  const { getByText } = render(
    <ScreenShell tags={[]} description="d" corners={<span>Credits</span>} />,
  )
  expect(getByText('Credits')).toBeTruthy()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web test ScreenShell`
Expected: FAIL — `Failed to resolve import "./ScreenShell"`.

- [ ] **Step 3: Write the stylesheet**

Create `apps/frontend/src/shared/ui/ScreenShell.module.css`. Values are ported from the mockup `apps/ui/src/screens/Invite/Invite.module.css`; typography is **not** ported (it comes from `<Typography>`):

```css
/* Shared screen frame for /start and /lobby/:lobbyId — layered background
   (photo + blur + scrim + HUD grid), language corner, and the left column
   (logo, tags, description). The column body is children: the menu on /start,
   the invite form on /lobby/:lobbyId.
   Ported from the design mockup apps/ui/src/screens/Invite/Invite.module.css.
   block-size: 100% — the height comes from the consuming page's wrapper. */
.root {
  position: relative;
  inline-size: 100%;
  block-size: 100%;
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

/* blur stronger on the left, fading out to the right edge (via mask) */
.blur {
  position: absolute;
  inset: 0;
  -webkit-backdrop-filter: blur(11px);
  backdrop-filter: blur(11px);
  -webkit-mask-image: linear-gradient(90deg, var(--bg) 0%, var(--black-70) 38%, transparent 66%);
  mask-image: linear-gradient(90deg, var(--bg) 0%, var(--black-70) 38%, transparent 66%);
}

/* gradient lighter on the left, stretched right, never fully transparent */
.scrim {
  position: absolute;
  inset: 0;
  background: var(--grad-scrim);
}

/* HUD grid above the gradient, below the content (in flow after .scrim, z-auto
   — the content sits higher by z-index). More specific than HudBackground's own
   .bg so its position:relative doesn't win. */
.root .bgLayer {
  position: absolute;
  inset: 0;
  border-radius: 0;
}

/* soft corner shade under the language switch — the photo is light and busy on
   the right, so a radial gradient keeps the switch readable over any frame */
.langShade {
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: 0;
  z-index: 2;
  inline-size: 340px;
  block-size: 200px;
  pointer-events: none;
  background: var(--grad-corner-shade);
}

/* language switch — top-right, mirroring the logo's inset on the left */
.langCorner {
  position: absolute;
  inset-block-start: 72px;
  inset-inline-end: 76px;
  z-index: 3;
}

.content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  block-size: 100%;
  padding-block: 64px;
  padding-inline-start: 76px;
  overflow-y: auto;
}

.col {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  inline-size: 460px;
}

.logo {
  inline-size: 263px;
  block-size: auto;

  /* compensates the glyph glow/inset in the SVG — puts "R" on the left line */
  margin: 0 0 12px -7px;
}

.tags {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-block-end: 22px;
  color: var(--cat-release);
  opacity: 0.85;
}

/* margin: 0 by design — the gap to the column body belongs to the body
   (.menu on /start, .form on the invite screen), so it can't be doubled. */
.desc {
  max-inline-size: 420px;
  margin: 0;
  line-height: 1.6;
  opacity: 0.82;
}

/* printed edition — bottom-right; position/width only, the plate's own look
   lives in the PhysicalEdition block */
.physical {
  position: absolute;
  inset-block-end: 15px;
  inset-inline-end: 51px;
  z-index: 2;
  inline-size: 56%;
  min-inline-size: 440px;
}
```

- [ ] **Step 4: Write the component**

Create `apps/frontend/src/shared/ui/ScreenShell.tsx`:

```tsx
import {
  HudBackground,
  LangSwitcher,
  PhysicalEdition,
  type PhysicalEditionCopy,
  type SwitchLang,
  Typography,
} from '@release/ui'
import type { ReactNode } from 'react'
import AppLogo from './AppLogo'
import styles from './ScreenShell.module.css'

// Ordering/pre-ordering the printed edition goes through the team's Instagram.
const INSTAGRAM_URL = 'https://www.instagram.com/mythhand.team/'

interface ScreenShellProps {
  tags: string[]
  description: string
  // language + setter: when both are given, the corner switch is drawn
  lang?: SwitchLang
  onLangChange?: (lang: SwitchLang) => void
  // printed-edition plate in the bottom-right; omitted when no copy is given
  physicalEditionCopy?: PhysicalEditionCopy
  // other absolutely-positioned blocks of the screen (video player, credits)
  corners?: ReactNode
  // the column body under the description — its own top gap is its own, since
  // .desc carries none
  children?: ReactNode
}

// The screen frame shared by /start and /lobby/:lobbyId: layered background,
// language corner, and the left column down to the description.
export default function ScreenShell({
  tags,
  description,
  lang,
  onLangChange,
  physicalEditionCopy,
  corners,
  children,
}: ScreenShellProps) {
  return (
    <div className={styles.root}>
      <div className={styles.bg} />
      <div className={styles.blur} />
      <div className={styles.scrim} />
      <HudBackground tone="grid" className={styles.bgLayer} />

      {lang && onLangChange && (
        <>
          <div className={styles.langShade} />
          <div className={styles.langCorner}>
            <LangSwitcher value={lang} onChange={onLangChange} />
          </div>
        </>
      )}

      <div className={styles.content}>
        <div className={styles.col}>
          <AppLogo className={styles.logo} />
          <div className={styles.tags}>
            {tags.map((tag) => (
              <Typography key={tag} variant="tag">
                {tag}
              </Typography>
            ))}
          </div>
          <Typography base="body" as="p" className={styles.desc}>
            {description}
          </Typography>
          {children}
        </div>
      </div>

      {corners}

      {physicalEditionCopy && (
        <PhysicalEdition
          href={INSTAGRAM_URL}
          copy={physicalEditionCopy}
          className={styles.physical}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @release/web test ScreenShell`
Expected: PASS — 5 tests.

- [ ] **Step 6: Verify the package**

Run: `pnpm --filter @release/web test && pnpm --filter @release/web typecheck && pnpm --filter @release/web stylelint`
Expected: all pass. If Stylelint reports property-order violations, run `pnpm format` from the repo root and re-run.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/shared/ui/ScreenShell.tsx apps/frontend/src/shared/ui/ScreenShell.module.css apps/frontend/src/shared/ui/ScreenShell.test.tsx
git commit -m "feat(web): ScreenShell — screen frame shared by /start and the invite screen"
```

---

## Task 2: `/start` composes `ScreenShell`

The start screen moves to the compact scale here, and regains the HUD grid its ported chrome dropped. This is the one visible design change in the plan.

**Files:**
- Modify: `apps/frontend/src/pages/start.tsx`
- Modify: `apps/frontend/src/pages/start.module.css`

**Interfaces:**
- Consumes: `ScreenShell` from Task 1.

- [ ] **Step 1: Delete the ported chrome**

In `apps/frontend/src/pages/start.module.css`, delete `.root`, `.bg`, `.blur`, `.scrim`, `.content`, `.col`, `.logo`, `.tags` and `.desc` — `ScreenShell` owns them. Keep `.hiddenSlot` and anything else below.

Replace `.menu` with — it gains the 44px top gap that `.desc`'s old `margin-block-end: 96px` used to provide, and its optical offset follows the smaller logo from `-11px` to `-7px`:

```css
/* Menu sits on the logo's optical left edge. The top gap to the description
   belongs to the column body — ScreenShell's description carries no margin. */
.menu {
  align-self: flex-start;
  inline-size: 300px;
  margin-block-start: 44px;
  margin-inline-start: -7px;
}
```

Add the wrapper that gives `ScreenShell` a definite height — `app/app.module.css` `.root` is `min-block-size: 100vh`, and a percentage height does not resolve against `min-height`:

```css
/* Screen frame. ScreenShell is block-size: 100%, so it needs a parent with a
   definite height — app.module.css only sets min-block-size. */
.screen {
  block-size: 100vh;
}
```

- [ ] **Step 2: Rewrite the page**

Replace the whole of `apps/frontend/src/pages/start.tsx` with:

```tsx
import { useTranslation } from '@release/translation'
import { Menu, MenuButton, MenuGroup, VideoPlayer } from '@release/ui'
import { useGoToLobby } from '~/app/lib/lobbyNavigation'
import { useSession } from '~/app/providers/SessionProvider'
import ScreenShell from '~/shared/ui/ScreenShell'
import { useModalRoute } from '~/shared/ui/ModalRouter'
import styles from './start.module.css'

const REPO_URL = 'https://github.com/dimbo-design/ReleaseBoardGameP2P'
const VIDEO_URL = 'https://www.youtube.com/embed/bxGtRnoYW4g?autoplay=1'

export default function StartPage() {
  const { t } = useTranslation()
  const handleMenuClick = useModalRoute()
  const session = useSession()
  const goToLobby = useGoToLobby()
  const hasSession = session.status === 'in-lobby' && !!session.state

  return (
    <div className={styles.screen}>
      <ScreenShell
        tags={[t('start.tagOpenP2P'), t('start.tagBoardCard')]}
        description={t('start.description')}
        corners={
          // Video player — expands in place to an inline iframe
          <VideoPlayer
            src={VIDEO_URL}
            copy={{
              videoReview: t('start.videoReview'),
              close: t('start.close'),
              title: t('start.logoAlt'),
            }}
          />
        }
      >
        <Menu className={styles.menu}>
          {/* Always rendered so toggling it never reflows the column — without
              a reserved slot, mounting/unmounting would change the column's
              height and shift everything. Hidden and inert when there is no
              session to resume. */}
          <MenuGroup>
            <MenuButton
              aria-hidden={!hasSession}
              disabled={!hasSession}
              className={hasSession ? undefined : styles.hiddenSlot}
              onClick={() => session.roomCode && goToLobby(session.roomCode)}
            >
              {t('start.continueSession')}
            </MenuButton>
            <MenuButton autoFocus value="create" onClick={handleMenuClick}>
              {t('start.createGame')}
            </MenuButton>
            <MenuButton value="join" onClick={handleMenuClick}>
              {t('start.joinGame')}
            </MenuButton>
          </MenuGroup>
          <MenuGroup>
            <MenuButton value="rules" onClick={handleMenuClick}>
              {t('start.rules')}
            </MenuButton>
          </MenuGroup>
          <MenuGroup>
            <MenuButton onClick={() => window.open(REPO_URL, '_blank', 'noopener')}>
              {t('start.github')}
            </MenuButton>
            <MenuButton
              onClick={() => {
                window.location.href = `${import.meta.env.BASE_URL}playground/`
              }}
            >
              {t('start.playground')}
            </MenuButton>
          </MenuGroup>
        </Menu>
      </ScreenShell>
    </div>
  )
}
```

`AppLogo` and the tag/description `<Typography>` elements move into `ScreenShell`, so the page no longer imports them.

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter @release/web test && pnpm --filter @release/web typecheck && pnpm --filter @release/web stylelint`
Expected: all pass. `src/pages/__tests__/start.test.tsx` queries menu labels, which are unchanged.

- [ ] **Step 4: Verify visually**

Run: `pnpm dev` and open `http://localhost:5173/start` at 1440×900.
Expected: the compact column (logo 263px wide, not 480) and — new — the HUD grid over the background photo. The continue-session slot, the `?modal=create` / `?modal=join` / `?modal=rules` routing and the video player all behave as before. Nothing clipped; no horizontal scrollbar.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/start.tsx apps/frontend/src/pages/start.module.css
git commit -m "refactor(web): /start composes ScreenShell, restoring the HUD grid"
```

---

## Task 3: `errorKind` on the session

**Files:**
- Modify: `apps/frontend/src/network/useLobby.ts`
- Modify: `apps/frontend/src/entities/lobby/index.ts`
- Test: `apps/frontend/src/network/useLobby.test.ts`

**Interfaces:**
- Produces: `export type ErrorKind = 'not-found' | 'connection' | null`, and `UseLobby` gains `errorKind: ErrorKind`. Re-exported through `~/entities/lobby`. Task 6 reads it; Task 7 sets it in the page fixture.

- [ ] **Step 1: Write the failing test**

`apps/frontend/src/network/useLobby.test.ts` currently only exercises the pure code-format helpers — there is no transport mock and no hook harness. Add both.

Replace the first line of the file with:

```ts
import { act, renderHook } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { formatRoomCode, makeRoomCode, parseRoomCode, useLobby } from './useLobby'

// Every fake transport createTransport hands out, with the callbacks useLobby
// passed in — so a test can fire an error or a disconnect by hand.
interface FakeTransport {
  id: string
  close: ReturnType<typeof vi.fn>
  onError?: (err: { type?: string; message: string }) => void
  onConnection?: (peerId: string) => void
}

// vi.mock is hoisted above the imports, so the array it closes over has to be
// hoisted too — otherwise the factory hits a temporal-dead-zone error.
const { transports } = vi.hoisted(() => ({ transports: [] as FakeTransport[] }))

vi.mock('./transport/peer', () => ({
  createTransport: vi.fn(
    async (args: {
      onError?: (err: { type?: string; message: string }) => void
      onConnection?: (peerId: string) => void
    }) => {
      const fake = {
        id: `peer${transports.length}`,
        close: vi.fn(),
        connectTo: vi.fn(),
        send: vi.fn(),
        broadcast: vi.fn(),
        relay: vi.fn(),
        connectedIds: () => [],
        onError: args.onError,
        onConnection: args.onConnection,
      }
      transports.push(fake)
      return fake
    },
  ),
}))

beforeEach(() => {
  transports.length = 0
})
```

Then append:

```ts
it('classifies a peer-unavailable error as not-found', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  act(() => {
    transports[0].onError?.({
      type: 'peer-unavailable',
      message: 'Could not connect to peer f96nmt',
    })
  })
  expect(result.current.status).toBe('error')
  expect(result.current.errorKind).toBe('not-found')
})

it('classifies any other error as a connection failure', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  act(() => {
    transports[0].onError?.({ type: 'network', message: 'Lost connection to server' })
  })
  expect(result.current.status).toBe('error')
  expect(result.current.errorKind).toBe('connection')
})

it('clears errorKind alongside the error', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  act(() => {
    transports[0].onError?.({ type: 'peer-unavailable', message: 'nope' })
  })
  act(() => {
    result.current.clearError()
  })
  expect(result.current.error).toBeNull()
  expect(result.current.errorKind).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web test useLobby`
Expected: FAIL — `errorKind` is `undefined`.

- [ ] **Step 3: Implement**

In `apps/frontend/src/network/useLobby.ts`:

```ts
// Semantic classification of a session failure, so the UI can show localized
// copy instead of the raw English PeerJS string. 'not-found' is specifically
// "no host answers to this code" (PeerJS `peer-unavailable`); everything else
// is a connection problem.
export type ErrorKind = 'not-found' | 'connection' | null

function classify(type?: string): Exclude<ErrorKind, null> {
  return type === 'peer-unavailable' ? 'not-found' : 'connection'
}
```

Add `errorKind: ErrorKind` to the `UseLobby` interface next to `error`, and the state next to the `error` state:

```ts
  const [errorKind, setErrorKind] = useState<ErrorKind>(null)
```

Set it everywhere `error` is set:

```ts
  const onError = useCallback((err: { type?: string; message: string }) => {
    setError(err.type ? `${err.type}: ${err.message}` : err.message)
    setErrorKind(classify(err.type))
    if (err.type !== 'connection') setStatus('error')
  }, [])

  const surfaceSetupError = useCallback((err: unknown) => {
    const e = err as { type?: string; message?: string }
    const message = e?.message ?? String(err)
    setError(e?.type ? `${e.type}: ${message}` : message)
    setErrorKind(classify(e?.type))
    setStatus('error')
  }, [])
```

In `onDisconnect`'s guest branch, both paths are connection failures — add `setErrorKind('connection')` beside the existing `setStatus('error')`.

Clear it in `leaveSession` and `clearError` beside `setError(null)`, and reset it at the top of `createRoom` and `joinRoom` beside their `setError(null)`.

Add `errorKind` to the returned object and to the `useMemo` dependency array.

- [ ] **Step 4: Re-export the type**

In `apps/frontend/src/entities/lobby/index.ts`:

```ts
export type { ErrorKind, PeerInfo, Role, UseLobby } from '~/network'
```

Check `apps/frontend/src/network/index.ts` re-exports `ErrorKind` from `./useLobby` too; add it if it lists exports explicitly.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @release/web test useLobby`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/network apps/frontend/src/entities/lobby/index.ts
git commit -m "feat(web): classify session errors as not-found or connection"
```

---

## Task 4: `joinRoom` closes an existing transport

Without this, the invite screen's retry button strands a live peer on every attempt.

**Files:**
- Modify: `apps/frontend/src/network/useLobby.ts`
- Test: `apps/frontend/src/network/useLobby.test.ts`

**Interfaces:**
- Consumes: Task 3's mock and harness in the same test file.

- [ ] **Step 1: Write the failing test**

```ts
it('closes the previous transport when joining again after a failure', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  act(() => {
    transports[0].onError?.({ type: 'peer-unavailable', message: 'nope' })
  })

  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })

  expect(transports).toHaveLength(2)
  expect(transports[0].close).toHaveBeenCalledOnce()
  expect(transports[1].close).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web test useLobby`
Expected: FAIL — `close` was never called on the first transport.

- [ ] **Step 3: Implement**

At the top of `joinRoom`, before `setStatus('connecting')`:

```ts
      // A retry (the invite screen reuses the same submit path) would otherwise
      // leave the previous peer open — createTransport is assigned over the ref
      // below, so nothing else would ever close it.
      transportRef.current?.close()
      transportRef.current = null
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @release/web test useLobby`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/network/useLobby.ts apps/frontend/src/network/useLobby.test.ts
git commit -m "fix(web): close the previous transport when re-joining a lobby"
```

---

## Task 5: `invite.*` copy

**Files:**
- Modify: `packages/translation/src/locales/en/common.json`
- Modify: `packages/translation/src/locales/ru/common.json`

**Interfaces:**
- Produces: the `invite.*` keys Task 6 reads. Types flow automatically — `packages/translation/src/i18next.d.ts` derives `CustomTypeOptions['resources']` from `en/common.json`.

The shared column's copy is **not** duplicated: the logo, the two tags and the description come from the existing `start.*` keys.

- [ ] **Step 1: Add the English block**

In `packages/translation/src/locales/en/common.json`, add a top-level `"invite"` key:

```json
  "invite": {
    "formTitle": "Game invite",
    "codeLabel": "game code",
    "nicknameLabel": "your nickname",
    "nicknamePlaceholder": "E.G. Dimbo",
    "randomNick": "random name",
    "roleTitle": "join as",
    "rolePlayer": "player",
    "roleSpectator": "spectator",
    "joinCta": "connect",
    "connecting": "connecting",
    "connected": "connected",
    "cancel": "cancel",
    "retry": "retry",
    "connectError": "couldn't connect",
    "notFoundStatus": "game not found",
    "homePage": "home page"
  }
```

- [ ] **Step 2: Add the Russian block**

```json
  "invite": {
    "formTitle": "Приглашение в игру",
    "codeLabel": "код игры",
    "nicknameLabel": "ваш никнейм",
    "nicknamePlaceholder": "НАПР. Dimbo",
    "randomNick": "случайный ник",
    "roleTitle": "подключиться как",
    "rolePlayer": "игрок",
    "roleSpectator": "зритель",
    "joinCta": "подключиться",
    "connecting": "подключение",
    "connected": "подключено",
    "cancel": "отмена",
    "retry": "повторить",
    "connectError": "не удалось подключиться",
    "notFoundStatus": "игра не найдена",
    "homePage": "главная страница"
  }
```

Note there are no `spectatorOnlyNote` / `noSlotsNote` / `checkSlots` / `fullStatus` keys: slot availability is unknowable before connecting (a joiner learns the roster only after the DataChannel opens) and `assignRole` never turns a joiner away for capacity, so those states are unreachable in the app.

- [ ] **Step 3: Verify**

Run: `pnpm --filter @release/translation typecheck && pnpm --filter @release/web typecheck`
Expected: PASS.

Confirm both catalogs have the same key set:

```bash
node -e "const e=require('./packages/translation/src/locales/en/common.json'),r=require('./packages/translation/src/locales/ru/common.json');const a=Object.keys(e.invite).sort(),b=Object.keys(r.invite).sort();console.log(JSON.stringify(a)===JSON.stringify(b)?'MATCH':'MISMATCH',a.length,b.length)"
```

Expected: `MATCH 16 16`

- [ ] **Step 4: Commit**

```bash
git add packages/translation/src/locales
git commit -m "feat(translation): invite screen copy"
```

---

## Task 6: The invite screen

**Files:**
- Create: `apps/frontend/src/pages/lobby/_InviteScreen.tsx`
- Create: `apps/frontend/src/pages/lobby/_InviteScreen.module.css`
- Test: `apps/frontend/src/pages/lobby/__tests__/inviteScreen.test.tsx`

**Reference:** `apps/ui/src/screens/Invite/Invite.tsx` and `Invite.module.css` — the form section, the role control, the action slot and the home button. Read them for structure and values; do not import from them.

**Interfaces:**
- Consumes: `ScreenShell` (Task 1); `errorKind` (Task 3); `invite.*` (Task 5); `Form` + `FormField` from `~/shared/ui/Form`; `useJoinLobby`, `useGoToLobby`, `useSession`.
- Produces: `InviteScreen` (default export, no props). Task 7 renders it.

**Typography conversion** — the mockup's `composes:` lines become `<Typography>` props:

| Mockup CSS | Frontend |
|---|---|
| `.formTitle` `composes: heading-8 tk-05` | `<Typography base="heading-8" tk="tk-05" as="h2">` |
| `.roleLabel` `composes: label-sm tk-16` | `<Typography base="label-sm" tk="tk-16" as="span">` |
| `.roleOpt` `composes: label-md tk-12` | `<Typography base="label-md" tk="tk-12">` inside the button |
| `.actionError` `composes: label-sm tk-10` | `<Typography base="label-sm" tk="tk-10" as="span">` |
| `.connectingStatus` / `.connected` `composes: button tk-18` | `<Typography base="button" tk="tk-18" as="span">` |

**State derivation**, in priority order:

| session | state |
|---|---|
| `status === 'connecting'` | connecting |
| `status === 'error'` && `errorKind === 'not-found'` | notFound |
| `status === 'error'` | failed |
| `status === 'in-lobby'` && `!state.peers[state.hostId]` | connected |
| otherwise | form |

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/pages/lobby/__tests__/inviteScreen.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import type { UseLobby } from '~/entities/lobby'
import InviteScreen from '../_InviteScreen'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { resolvedLanguage: 'en', changeLanguage: vi.fn() },
  }),
}))

let sessionValue: UseLobby
vi.mock('~/app/providers/SessionProvider', () => ({
  useSession: () => sessionValue,
}))

function base(): UseLobby {
  return {
    state: null,
    status: 'idle',
    roomCode: null,
    isHost: false,
    canStart: false,
    error: null,
    errorKind: null,
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    ready: vi.fn(),
    kick: vi.fn(),
    setMaxPlayers: vi.fn(),
    transferHost: vi.fn(),
    setSetup: vi.fn(),
    disband: vi.fn(),
    leaveSession: vi.fn(),
    clearError: vi.fn(),
  }
}

const joined = (peers: Record<string, unknown>): UseLobby =>
  ({
    ...base(),
    status: 'in-lobby',
    roomCode: 'F96-NMT',
    state: { selfId: 'me', hostId: 'h', maxPlayers: 6, setup: {}, peers },
  }) as UseLobby

const renderScreen = () =>
  render(
    <MemoryRouter>
      <InviteScreen />
    </MemoryRouter>,
  )

it('shows the form when there is no session', () => {
  sessionValue = base()
  renderScreen()
  expect(screen.getByText('invite.formTitle')).toBeTruthy()
  expect(screen.getByText('invite.joinCta')).toBeTruthy()
})

it('disables the spectator role, since guest mode is not supported yet', () => {
  sessionValue = base()
  renderScreen()
  expect((screen.getByText('invite.roleSpectator').closest('button'))?.disabled).toBe(true)
  expect((screen.getByText('invite.rolePlayer').closest('button'))?.disabled).toBe(false)
})

it('shows the connecting state with a cancel action', () => {
  sessionValue = { ...base(), status: 'connecting' }
  renderScreen()
  expect(screen.getByText('invite.connecting')).toBeTruthy()
  expect(screen.getByText('invite.cancel')).toBeTruthy()
})

it('shows the connected state until the roster arrives', () => {
  sessionValue = joined({ me: { id: 'me', name: 'Me', role: 'guest', ready: false } })
  renderScreen()
  expect(screen.getByText('invite.connected')).toBeTruthy()
})

it('shows the not-found status for an unknown code', () => {
  sessionValue = { ...base(), status: 'error', error: 'peer-unavailable: x', errorKind: 'not-found' }
  renderScreen()
  expect(screen.getByText('invite.notFoundStatus')).toBeTruthy()
  expect(screen.getByText('invite.retry')).toBeTruthy()
})

it('shows the generic failure status for a connection error', () => {
  sessionValue = { ...base(), status: 'error', error: 'network: x', errorKind: 'connection' }
  renderScreen()
  expect(screen.getByText('invite.connectError')).toBeTruthy()
  expect(screen.getByText('invite.retry')).toBeTruthy()
})

it('never leaks the raw PeerJS error string', () => {
  sessionValue = { ...base(), status: 'error', error: 'peer-unavailable: x', errorKind: 'not-found' }
  renderScreen()
  expect(screen.queryByText(/peer-unavailable/)).toBeNull()
})

it('cancelling a connection tears the session down', () => {
  sessionValue = { ...base(), status: 'connecting' }
  renderScreen()
  fireEvent.click(screen.getByText('invite.cancel'))
  expect(sessionValue.leaveSession).toHaveBeenCalledOnce()
})

it('does not join when the nickname is empty', () => {
  sessionValue = base()
  renderScreen()
  fireEvent.click(screen.getByText('invite.joinCta'))
  expect(sessionValue.joinRoom).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web test inviteScreen`
Expected: FAIL — `Failed to resolve import "../_InviteScreen"`.

- [ ] **Step 3: Write the stylesheet**

Create `apps/frontend/src/pages/lobby/_InviteScreen.module.css`. Values ported from the mockup's `Invite.module.css`, minus every `composes:` line:

```css
/* Screen frame. ScreenShell is block-size: 100%, so it needs a parent with a
   definite height — app.module.css only sets min-block-size. */
.screen {
  block-size: 100vh;
}

/* the invite form — the column body under the description */
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  inline-size: 360px;
  margin-block-start: 44px;
}

/* fixed-height field container, sized with room for the role control: the form
   breathes inside it while the action slot and home button below stay put */
.fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-block-size: 295px;
}

.formTitle {
  margin: 0 0 4px;
  color: var(--fg);
}

/* role choice — styled like the input fields: label above, segments below */
.role {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.roleLabel {
  opacity: 0.55;
}

.roleOptions {
  display: flex;
  inline-size: 320px;
  background: var(--white-05);
  border: 1px solid var(--white-18);
}

.roleOpt {
  flex: 1;
  padding: 12px 14px;
  color: var(--white-55);
  cursor: pointer;
  background: transparent;
  border: 0;
}

.roleOptOn {
  color: var(--fg);
  background: var(--white-12);
}

.roleOpt + .roleOpt {
  border-inline-start: 1px solid var(--white-18);
}

.roleOpt:disabled {
  cursor: default;
  opacity: 0.4;
}

.roleOpt:hover:not(:disabled) {
  color: var(--fg);
}

/* action slot — the width of the code input (320), fixed height for the tallest
   state (status line + button). The action is pinned to the bottom so the button
   doesn't jump between states; the message is added above it. */
.action {
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: flex-end;
  inline-size: 320px;
  block-size: 70px;
  margin-block-start: 4px;
}

/* status line above the action (failed / not found) — the field-error language */
.actionError {
  color: var(--cat-attack);
  text-align: center;
}

.actionRow {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* connecting: spinner + status + cancel as one centred group */
.connecting {
  display: flex;
  gap: 12px;
  align-items: center;
}

.connectingStatus {
  display: flex;
  gap: 10px;
  align-items: center;
  padding-block: 10px; /* same box as the button, so the text sits on its line */
  color: var(--white-70);
}

/* success — green, until the lobby takes over */
.connected {
  padding-block: 10px;
  color: var(--brand-green);
}

/* leaving for the start screen — set off by a clear gap, on the same centre
   line as the connect button */
.home {
  display: flex;
  justify-content: center;
  inline-size: 320px;
  margin-block-start: 64px;
}
```

- [ ] **Step 4: Write the component**

Create `apps/frontend/src/pages/lobby/_InviteScreen.tsx`:

```tsx
import { useTranslation } from '@release/translation'
import { Button, randomNickname, sanitizeNickname, Spinner, Typography } from '@release/ui'
import { useState } from 'react'
import { useParams } from 'react-router'
import DiceIcon from '@/icons/DiceIcon'
import { useGoToLobby } from '~/app/lib/lobbyNavigation'
import { useSession } from '~/app/providers/SessionProvider'
import { useNavigate } from '~/app/router'
import { useJoinLobby } from '~/features/join-lobby/useJoinLobby'
import Form, { FormField } from '~/shared/ui/Form'
import ScreenShell from '~/shared/ui/ScreenShell'
import styles from './_InviteScreen.module.css'

// The invite screen (/lobby/:lobbyId before a live session). The session status
// drives which of the five states the action slot shows; the form itself stays
// visible throughout, disabled while a connection is in flight.
export default function InviteScreen() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const joinLobby = useJoinLobby()
  const goToLobby = useGoToLobby()
  const navigate = useNavigate()
  // On an invite link the code is in the URL; it pre-fills the field.
  const { lobbyId } = useParams()
  const [name, setName] = useState('')

  // Connected, but the host's PEER_LIST hasn't landed yet: joinRoom seeds
  // `peers` with only the joiner, and applyPeerList swaps in the full roster
  // (which includes the host). So the host's absence IS "roster not yet here".
  // A host has selfId === hostId, so it never reads as connected.
  const rosterPending =
    session.status === 'in-lobby' && !!session.state && !session.state.peers[session.state.hostId]

  const connecting = session.status === 'connecting'
  const connected = rosterPending
  const busy = connecting || connected

  // The action slot's status line — localized, never the raw PeerJS string.
  const status =
    session.status === 'error'
      ? session.errorKind === 'not-found'
        ? t('invite.notFoundStatus')
        : t('invite.connectError')
      : null

  const lang = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'

  return (
    <div className={styles.screen}>
      <ScreenShell
        tags={[t('start.tagOpenP2P'), t('start.tagBoardCard')]}
        description={t('start.description')}
        physicalEditionCopy={t('physicalEdition', { returnObjects: true })}
        lang={lang}
        onLangChange={(next) => i18n.changeLanguage(next)}
      >
        <Form
          className={styles.form}
          requiredMessage={t('start.required')}
          onSubmit={async (data) => {
            if (busy) return
            const nickname = sanitizeNickname(data.name ?? '').trim()
            const code = data.code ?? ''
            if (!nickname || !code.trim()) return
            try {
              // A setup failure rejects here and surfaces through
              // session.error/errorKind, so only navigate on success.
              const formatted = await joinLobby(code, nickname)
              goToLobby(formatted)
            } catch {
              // Already surfaced as failed / notFound; stay on the screen.
            }
          }}
        >
          <Typography base="heading-8" tk="tk-05" as="h2" className={styles.formTitle}>
            {t('invite.formTitle')}
          </Typography>

          <div className={styles.fields}>
            {/* Role choice comes first. Spectator is disabled: the host assigns
                the role (assignRole) and the wire protocol carries no requested
                role, so guest mode isn't supported yet. */}
            <div className={styles.role}>
              <Typography base="label-sm" tk="tk-16" as="span" className={styles.roleLabel}>
                {t('invite.roleTitle')}
              </Typography>
              <div className={styles.roleOptions}>
                <button
                  type="button"
                  disabled={busy}
                  className={`${styles.roleOpt} ${styles.roleOptOn}`}
                >
                  <Typography base="label-md" tk="tk-12">
                    {t('invite.rolePlayer')}
                  </Typography>
                </button>
                <button type="button" disabled className={styles.roleOpt}>
                  <Typography base="label-md" tk="tk-12">
                    {t('invite.roleSpectator')}
                  </Typography>
                </button>
              </div>
            </div>

            <FormField
              name="name"
              label={t('invite.nicknameLabel')}
              placeholder={t('invite.nicknamePlaceholder')}
              maxLength={20}
              required
              plain
              disabled={busy}
              value={name}
              onChange={(e) => setName(sanitizeNickname(e.target.value))}
              trailing={
                <Button
                  variant="icon"
                  onClick={() => setName(randomNickname())}
                  aria-label={t('invite.randomNick')}
                  title={t('invite.randomNick')}
                >
                  <DiceIcon />
                </Button>
              }
            />
            <FormField
              name="code"
              label={t('invite.codeLabel')}
              defaultValue={lobbyId ?? ''}
              required
              disabled={busy}
            />
          </div>

          <div className={styles.action}>
            {status && (
              <Typography base="label-sm" tk="tk-10" as="span" className={styles.actionError}>
                {status}
              </Typography>
            )}
            <div className={styles.actionRow}>
              {connecting ? (
                <div className={styles.connecting}>
                  <Typography base="button" tk="tk-18" as="span" className={styles.connectingStatus}>
                    <Spinner size={16} />
                    {t('invite.connecting')}
                  </Typography>
                  <Button variant="tech" onClick={() => session.leaveSession()}>
                    {t('invite.cancel')}
                  </Button>
                </div>
              ) : connected ? (
                <Typography base="button" tk="tk-18" as="span" className={styles.connected}>
                  {t('invite.connected')}
                </Typography>
              ) : (
                // Retry is the same submit — only the label changes.
                <Button type="submit">{status ? t('invite.retry') : t('invite.joinCta')}</Button>
              )}
            </div>
          </div>
        </Form>

        <div className={styles.home}>
          <Button
            onClick={() => {
              session.leaveSession()
              navigate('/start')
            }}
          >
            {t('invite.homePage')}
          </Button>
        </div>
      </ScreenShell>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @release/web test inviteScreen`
Expected: PASS — 9 tests.

- [ ] **Step 6: Verify the package**

Run: `pnpm --filter @release/web test && pnpm --filter @release/web typecheck && pnpm --filter @release/web stylelint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/lobby/_InviteScreen.tsx apps/frontend/src/pages/lobby/_InviteScreen.module.css apps/frontend/src/pages/lobby/__tests__/inviteScreen.test.tsx
git commit -m "feat(web): invite screen for /lobby/:lobbyId"
```

---

## Task 7: Wire the route

**Files:**
- Modify: `apps/frontend/src/pages/lobby/[lobbyId].tsx`
- Modify: `apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx`

**Interfaces:**
- Consumes: `InviteScreen` (Task 6), `errorKind` (Task 3).

- [ ] **Step 1: Update the page**

In `apps/frontend/src/pages/lobby/[lobbyId].tsx`, add:

```tsx
import InviteScreen from './_InviteScreen'
```

Remove the now-unused `JoinLobbyForm` import — it stays in the codebase for the start-screen join modal; only this page stops using it.

Inside the `session.status === 'in-lobby' && session.state` branch, after the `!continued` interstitial and before `return <LobbyView />`:

```tsx
    // The channel is open but the host's roster hasn't arrived; show the
    // invite screen's `connected` beat rather than an empty lobby.
    if (!session.state.peers[session.state.hostId]) return <InviteScreen />
```

Replace the whole final `return (…)` block — the `Shell`, the connecting line, the card with `JoinLobbyForm`, and the Back link — with:

```tsx
  return <InviteScreen />
```

`Shell`, `card`, `ghostBtn`, `label` and `styles` from `./_ui` are still used by the kicked/disbanded and interstitial branches, so keep that import.

- [ ] **Step 2: Update the fixture and the four pre-session tests**

In `apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx`, add `errorKind: null,` to `base()` next to `error: null,`, and extend the translation mock so `_InviteScreen` can read the language:

```tsx
vi.mock('@release/translation', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'ru', resolvedLanguage: 'ru', changeLanguage: vi.fn() },
  }),
}))
```

Replace the four pre-session tests with:

```tsx
it('shows the invite screen when there is no session', () => {
  sessionValue = base()
  renderInRouter(<LobbyPage />)
  expect(screen.getByText('invite.formTitle')).toBeTruthy()
  expect(screen.getByText('invite.joinCta')).toBeTruthy()
})

it('pre-fills the code from a shared /lobby/:lobbyId link', () => {
  sessionValue = base()
  render(
    <MemoryRouter initialEntries={['/lobby/ABC-23D']}>
      <Routes>
        <Route path="/lobby/:lobbyId" element={<LobbyPage />} />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByDisplayValue('ABC-23D')).toBeTruthy()
})

it('clears a stale error on mount', () => {
  sessionValue = { ...base(), status: 'error', error: 'peer-unavailable', errorKind: 'not-found' }
  renderInRouter(<LobbyPage />)
  expect(sessionValue.clearError).toHaveBeenCalledOnce()
})

it('the invite screen home button resets the (failed) session', () => {
  sessionValue = { ...base(), status: 'error', error: 'peer-unavailable', errorKind: 'not-found' }
  renderInRouter(<LobbyPage />)
  fireEvent.click(screen.getByText('invite.homePage'))
  expect(sessionValue.leaveSession).toHaveBeenCalledOnce()
})
```

Leave the other twelve tests untouched. Their `inSession()` fixture seeds `peers.h` against `hostId: 'h'`, so the new roster check resolves to `LobbyView` exactly as before.

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter @release/web test lobby`
Expected: PASS — all sixteen.

- [ ] **Step 4: Full verification**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass across every workspace.

- [ ] **Step 5: Verify end to end**

Run `pnpm dev:p2p`. In one browser create a lobby and copy its code. In a second window:

| Try | Expected |
|---|---|
| Open `/lobby/<valid-code>` | The invite screen, code pre-filled, spectator segment dimmed |
| Submit with an empty nickname | The nickname field shakes; no join attempt |
| Fill a nickname and connect | `connecting` with spinner and cancel, then a brief `connected`, then the lobby roster |
| Click cancel during connecting | Back to the form |
| Open `/lobby/ZZZ-ZZZ` and connect | The localized "game not found" line and a retry button — **not** `peer-unavailable: …` |
| Retry after that failure | A fresh attempt; no accumulating peers in the network tab |
| Click the home button | `/start` |
| Toggle RU/EN in the corner | Every label switches |

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/lobby
git commit -m "feat(web): /lobby/:lobbyId renders the invite screen in all five states"
```

---

## Verification Checklist

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass
- [ ] `apps/ui/` and `apps/playground/` are untouched by this branch
- [ ] `/start`: compact column, HUD grid restored, modals and continue-session unchanged
- [ ] `/lobby/:lobbyId`: all five states, no raw PeerJS strings
- [ ] `/lobby/:lobbyId` kicked, disbanded and Continue/Leave branches unchanged
