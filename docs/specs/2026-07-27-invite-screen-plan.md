# Invite Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `/lobby/:lobbyId` with the playground's invite screen across all five reachable states, on a layout shared with the start screen.

**Architecture:** A new `ScreenShell` in `@release/ui` owns the chrome and the opening column that the start and invite screens share; both screens compose it, and the frontend's `/start` and `/lobby/:lobbyId` consume it through `@release/ui` instead of re-porting CSS. The lobby route gains a thin adapter that maps session state onto `Invite`'s `state` prop.

**Tech Stack:** React 19, TypeScript, CSS Modules + design tokens, `@release/ui`, `@release/translation` (i18next), PeerJS transport, Vitest + Testing Library, Biome + Stylelint.

Design: [`docs/specs/2026-07-27-invite-screen-design.md`](./2026-07-27-invite-screen-design.md).

## Global Constraints

- Colors are design tokens only — `var(--*)` from `apps/ui/src/design/tokens.css`. Never a `#hex`, `rgb()`, `hsl()` or named color.
- Every styled component has a co-located `*.module.css`. Typography in `apps/ui` comes via `composes: … from '../../design/typography.module.css'`.
- In `apps/frontend`, all copy renders through `<Typography>` from `@release/ui` — never a raw `<p>` / `<span>` / `<h1>`, never hand-written font declarations.
- All user-visible strings go through `t()` with keys present in **both** `packages/translation/src/locales/en/common.json` and `…/ru/common.json`.
- `apps/frontend` layering: a module imports only from layers below it (`app` → `pages` → `features` → `entities` → `shared`, plus `network` via `entities`/`features`). Use the `~` alias for `src`.
- Files under `apps/frontend/src/pages/` that start with `_` are ignored by generouted. Page tests live in `__tests__/`, never beside the page.
- `pnpm lint`, `pnpm typecheck` and `pnpm test` must pass before every commit. The repo's pre-commit hook runs typecheck.
- Work on branch `invite-screen-design`.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `apps/ui/src/screens/ScreenShell/ScreenShell.tsx` | Shared chrome + opening column; column body via `children` |
| `apps/ui/src/screens/ScreenShell/ScreenShell.module.css` | Its layout — background layers, lang corner, `.content`/`.col`, logo/tags/desc, `.physical` |
| `apps/ui/src/screens/ScreenShell/ScreenShell.test.tsx` | Children, conditional lang corner, conditional printed-edition block |
| `apps/ui/src/screens/ScreenShell/index.ts` | Barrel |
| `apps/ui/src/screens/Invite/Invite.test.tsx` | `playerOnly` behaviour |
| `apps/frontend/src/pages/lobby/_InviteScreen.tsx` | Session → `Invite` props adapter |
| `apps/frontend/src/pages/lobby/_InviteScreen.module.css` | One class: the `100vh` wrapper the height contract needs |
| `apps/frontend/src/pages/lobby/__tests__/inviteScreen.test.tsx` | State-derivation table test |

**Modified**

| File | Change |
|---|---|
| `apps/ui/src/screens/Start/Start.tsx` | Composes `ScreenShell` |
| `apps/ui/src/screens/Start/Start.module.css` | Chrome + column rules deleted; `.menu` gains its top gap and new optical offset |
| `apps/ui/src/screens/Invite/Invite.tsx` | Composes `ScreenShell`; `playerOnly` |
| `apps/ui/src/screens/Invite/Invite.module.css` | Chrome + column rules deleted |
| `apps/ui/src/index.ts` | Exports `ScreenShell` |
| `apps/playground/stories/InviteStory/InviteStory.tsx` | `playerOnly` option; copy read from the catalog |
| `apps/frontend/src/pages/start.tsx` | Composes `ScreenShell` |
| `apps/frontend/src/pages/start.module.css` | Ported chrome deleted |
| `apps/frontend/src/network/useLobby.ts` | `errorKind`; `joinRoom` closes an existing transport |
| `apps/frontend/src/network/useLobby.test.ts` | Covers both |
| `apps/frontend/src/pages/lobby/[lobbyId].tsx` | Renders `_InviteScreen` |
| `apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx` | Four pre-session tests rewritten; `base()` gains `errorKind` |
| `packages/translation/src/locales/{en,ru}/common.json` | `invite.*` block |

---

## Task 1: `ScreenShell`

**Files:**
- Create: `apps/ui/src/screens/ScreenShell/ScreenShell.tsx`
- Create: `apps/ui/src/screens/ScreenShell/ScreenShell.module.css`
- Create: `apps/ui/src/screens/ScreenShell/index.ts`
- Test: `apps/ui/src/screens/ScreenShell/ScreenShell.test.tsx`
- Modify: `apps/ui/src/index.ts`

**Interfaces:**
- Consumes: `LangSwitcher` + `SwitchLang` from `@/blocks/LangSwitcher`, `PhysicalEdition` + `PhysicalEditionCopy` from `@/blocks/PhysicalEdition`, `ReleaseLogo` from `@/brand/ReleaseLogo`, `HudBackground` from `@/primitives/HudBackground`.
- Produces: `ScreenShell` (default export) and `ScreenShellProps`:
  ```ts
  interface ScreenShellProps {
    logoVariant?: 'ru' | 'en'
    tags: string[]
    description: string
    lang?: SwitchLang
    onLangChange?: (lang: SwitchLang) => void
    physicalEditionCopy?: PhysicalEditionCopy
    corners?: ReactNode
    children?: ReactNode
  }
  ```
  Note there is no `logoAlt` — `ReleaseLogo` takes only `variant`, `blink` and `className`. `Start` keeps `copy.logoAlt` for its `VideoPlayer` title.

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/screens/ScreenShell/ScreenShell.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import ScreenShell from './ScreenShell'

const COPY = {
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

  rerender(<ScreenShell tags={[]} description="d" physicalEditionCopy={COPY} />)
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

Run: `pnpm --filter @release/ui test ScreenShell`
Expected: FAIL — `Failed to resolve import "./ScreenShell"`.

- [ ] **Step 3: Write the stylesheet**

Create `apps/ui/src/screens/ScreenShell/ScreenShell.module.css`. Every rule here is lifted verbatim from `Start.module.css` / `Invite.module.css` except the three marked `CHANGED:` below. (`.root`, `.content`'s `overflow-y` and `.desc`'s `composes: body` come from the *invite* screen's values, which is why only three rules are marked — they are verbatim from one source, not new.)

```css
/* Общая оболочка экранов Start/Invite: слоёный фон (фото + блюр + затемнение),
   угол языка, левая колонка с логотипом/тегами/описанием. Тело колонки —
   children: меню на Start, форма приглашения на Invite.
   block-size: 100% — оболочку по высоте задаёт контейнер консьюмера. */
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
  background-image: url("../../assets/home/photo.jpg");
  background-position: center right;
  background-size: cover;
}

/* мягкое затемнение фона под свитчером языка — фон справа светлый и пёстрый,
   радиальный градиент из угла даёт читаемую подложку независимо от картинки */
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

/* переключатель языка — правый верхний угол, симметрично логотипу слева */
.langCorner {
  position: absolute;
  inset-block-start: 72px;
  inset-inline-end: 76px;
  z-index: 3;
}

/* блюр сильнее слева, к правому краю исчезает (через mask) */
.blur {
  position: absolute;
  inset: 0;
  -webkit-backdrop-filter: blur(11px);
  backdrop-filter: blur(11px);
  -webkit-mask-image: linear-gradient(90deg, var(--bg) 0%, var(--black-70) 38%, transparent 66%);
  mask-image: linear-gradient(90deg, var(--bg) 0%, var(--black-70) 38%, transparent 66%);
}

/* градиент легче слева, растянут вправо, не до полной прозрачности */
.scrim {
  position: absolute;
  inset: 0;
  background: var(--grad-scrim);
}

/* HUD-сетка поверх градиента, под контентом (в потоке после .scrim, z-auto —
   контент выше по z-index). Специфичнее .bg из HudBackground, чтобы его
   position:relative не победил. */
.root .bgLayer {
  position: absolute;
  inset: 0;
  border-radius: 0;
}

/* CHANGED: единое значение для обоих экранов — padding-block 64px (было 72px
   сверху на Start) и overflow-y для высокой колонки приглашения */
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

/* CHANGED: компактный масштаб — общий для обоих экранов (см. спеку, «Layout
   measurements»): 480px не оставляет месту под форму приглашения */
.logo {
  inline-size: 263px;
  block-size: auto;

  /* компенсация glow/инсета глифа в SVG — «R» на левую линию (масштаб ширины) */
  margin: 0 0 12px -7px;
}

.tags {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-block-end: 22px;
}

.tag {
  composes: label tk-16 from '../../design/typography.module.css';
  color: var(--cat-release);
  opacity: 0.85;
}

/* CHANGED: margin: 0 — отступ до тела колонки принадлежит самому телу
   (.menu на Start, .form на Invite), чтобы он не задваивался */
.desc {
  composes: body from '../../design/typography.module.css';
  max-inline-size: 420px;
  margin: 0;
  line-height: 1.6; /* нюанс интерлиньяжа — чуть плотнее базового 1.62 */
  opacity: 0.82;
}

/* ===== печатная версия (блок PhysicalEdition) — правый нижний угол ===== только
   позиция/ширина; сам вид плашки живёт в блоке. */
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

Create `apps/ui/src/screens/ScreenShell/ScreenShell.tsx`:

```tsx
import type { ReactNode } from 'react'
import LangSwitcher, { type SwitchLang } from '@/blocks/LangSwitcher'
import PhysicalEdition, { type PhysicalEditionCopy } from '@/blocks/PhysicalEdition'
import ReleaseLogo from '@/brand/ReleaseLogo'
import HudBackground from '@/primitives/HudBackground'
import styles from './ScreenShell.module.css'

// заказ/предзаказ печатной версии — Instagram команды; один и тот же адрес на
// всех экранах, поэтому живёт здесь, а не у каждого консьюмера
const INSTAGRAM_URL = 'https://www.instagram.com/mythhand.team/'

export interface ScreenShellProps {
  // вариант начертания логотипа под язык интерфейса
  logoVariant?: 'ru' | 'en'
  tags: string[]
  description: string
  // язык + смена: когда оба переданы — в правом верхнем углу рисуется свитчер
  lang?: SwitchLang
  onLangChange?: (lang: SwitchLang) => void
  // блок печатной версии в правом нижнем углу; без копирайта не рисуется
  physicalEditionCopy?: PhysicalEditionCopy
  // прочие абсолютно спозиционированные блоки экрана (авторство, видео)
  corners?: ReactNode
  // тело колонки под описанием — меню на Start, форма на Invite. Свой верхний
  // отступ задаёт само тело (.desc его не держит)
  children?: ReactNode
}

// Оболочка экрана: всё, что общего у Start и Invite — слоёный фон, угол языка,
// левая колонка (логотип, теги, описание) и печатная версия в углу.
export default function ScreenShell({
  logoVariant,
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
      {/* HUD-сетка: над градиентом/картинкой, под контентом */}
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
          <ReleaseLogo className={styles.logo} variant={logoVariant} />
          <div className={styles.tags}>
            {tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
          </div>
          <p className={styles.desc}>{description}</p>
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

Create `apps/ui/src/screens/ScreenShell/index.ts`:

```ts
export type { ScreenShellProps } from './ScreenShell'
export { default } from './ScreenShell'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @release/ui test ScreenShell`
Expected: PASS — 5 tests.

- [ ] **Step 6: Export it from the library**

In `apps/ui/src/index.ts`, add next to the other screen exports (the file is alphabetised — put it after the `Lobby` export and before `StartCopy`):

```ts
export type { ScreenShellProps } from './screens/ScreenShell'
export { default as ScreenShell } from './screens/ScreenShell'
```

- [ ] **Step 7: Verify the whole package**

Run: `pnpm --filter @release/ui test && pnpm --filter @release/ui typecheck && pnpm --filter @release/ui stylelint`
Expected: all pass. If Stylelint reports property-order violations, run `pnpm format` and re-run.

- [ ] **Step 8: Commit**

```bash
git add apps/ui/src/screens/ScreenShell apps/ui/src/index.ts
git commit -m "feat(ui): ScreenShell — chrome and opening column shared by Start and Invite"
```

---

## Task 2: `Start` composes `ScreenShell`

The start screen moves to the compact scale here. This is the one visible design change in the plan; verify it in the playground before moving on.

**Files:**
- Modify: `apps/ui/src/screens/Start/Start.tsx`
- Modify: `apps/ui/src/screens/Start/Start.module.css`

**Interfaces:**
- Consumes: `ScreenShell` / `ScreenShellProps` from Task 1.
- Produces: no API change — `StartCopy` and `StartProps` keep their current shape.

- [ ] **Step 1: Delete the moved rules from the stylesheet**

In `apps/ui/src/screens/Start/Start.module.css`, delete these rules outright — `ScreenShell` owns them now: `.root`, `.bg`, `.langShade`, `.langCorner`, `.blur`, `.scrim`, `.root .bgLayer`, `.content`, `.col`, `.logo`, `.tags`, `.tag`, `.desc`, `.physical`.

Keep `.credits`, `.credit`, `.creditLabel`, `.creditLink`, `.ctaIdle`, `.note`, `.createGrid`, `.createMods`, `.createTech`, `.techTitle` unchanged.

Replace `.menu` with this — it gains the 44px top gap that `.desc` used to provide via its `margin-block-end: 96px`, and its optical offset follows the logo from `-11px` to `-7px`:

```css
/* меню действий (блок Menu) — по визуальному центру ЛОГОТИПА: ширину 300 и тот
   же левый сдвиг задаём здесь (привязка к лого), а раскладку групп и
   центрирование пунктов даёт сам блок Menu/MenuGroup. Верхний отступ до
   описания принадлежит телу колонки — ScreenShell его не держит. */
.menu {
  align-self: flex-start;
  inline-size: 300px;
  margin-block-start: 44px;
  margin-inline-start: -7px;
}
```

- [ ] **Step 2: Rewrite the component's frame**

In `apps/ui/src/screens/Start/Start.tsx`:

Remove these imports — `ScreenShell` owns them: `LangSwitcher` (and its `SwitchLang` type stays, it is still a prop type), `PhysicalEdition` (the `PhysicalEditionCopy` type stays), `ReleaseLogo`, `HudBackground`. Remove the `INSTAGRAM_URL` constant. Add:

```tsx
import ScreenShell from '@/screens/ScreenShell'
```

The `SwitchLang` and `PhysicalEditionCopy` types are still used by `StartProps`, so keep them as type-only imports:

```tsx
import type { SwitchLang } from '@/blocks/LangSwitcher'
import type { PhysicalEditionCopy } from '@/blocks/PhysicalEdition'
```

Replace everything from `return (` down to the line before the first `<Modal open={modal === 'create'}`, with:

```tsx
  return (
    <div className={styles.screen}>
      <ScreenShell
        logoVariant={copy.logoVariant}
        tags={copy.tags}
        description={copy.description}
        lang={lang}
        onLangChange={onLangChange}
        physicalEditionCopy={physicalEditionCopy}
        corners={
          <>
            {/* авторство — левый нижний угол экрана; имена ведут на профили GitHub */}
            <div className={styles.credits}>
              <span className={styles.credit}>
                <span className={styles.creditLabel}>{copy.authorDesign}</span>
                <a
                  className={styles.creditLink}
                  href={DESIGN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {DESIGN_NAME}
                </a>
              </span>
              <span className={styles.credit}>
                <span className={styles.creditLabel}>{copy.authorDev}</span>
                <span>
                  <a
                    className={styles.creditLink}
                    href={CLAUDE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {CLAUDE_NAME}
                  </a>
                  {', '}
                  <a
                    className={styles.creditLink}
                    href={DEV_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {DEV_NAME}
                  </a>
                  {', '}
                  <a
                    className={styles.creditLink}
                    href={DESIGN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {DESIGN_NAME}
                  </a>
                </span>
              </span>
            </div>

            {/* play button that expands in place into the video embed */}
            <VideoPlayer
              src={VIDEO_URL}
              copy={{ videoReview: copy.videoReview, close: copy.close, title: copy.logoAlt }}
            />
          </>
        }
      >
        <Menu className={styles.menu}>
          <MenuGroup>
            <MenuButton onClick={() => setModal('create')}>{copy.createGame}</MenuButton>
            <MenuButton onClick={() => setModal('join')}>{copy.joinGame}</MenuButton>
          </MenuGroup>
          <MenuGroup>
            <MenuButton onClick={() => setModal('rules')}>{copy.rules}</MenuButton>
          </MenuGroup>
          <MenuGroup>
            <MenuButton onClick={() => window.open(GITHUB_URL, '_blank', 'noopener')}>
              {copy.github}
            </MenuButton>
            <MenuButton onClick={() => onPlayground?.()}>{copy.playground}</MenuButton>
          </MenuGroup>
        </Menu>
      </ScreenShell>

```

The three `<Modal>` blocks stay exactly as they are, and the component's closing tags become `</div>` (was the old `.root` div — now `.screen`).

- [ ] **Step 3: Add the wrapper class**

The modals must live outside `ScreenShell` (it clips with `overflow: hidden`), so `Start` keeps a bare wrapper that also supplies the definite height `ScreenShell`'s `block-size: 100%` needs. Add to `Start.module.css`:

```css
/* каркас экрана: оболочка + модалки. Держит высоту вьюпорта — ScreenShell
   внутри тянется на 100% от неё. */
.screen {
  block-size: 100vh;
}
```

- [ ] **Step 4: Verify the package**

Run: `pnpm --filter @release/ui test && pnpm --filter @release/ui typecheck && pnpm --filter @release/ui stylelint`
Expected: all pass.

- [ ] **Step 5: Verify visually**

Run: `pnpm dev:playground`
Open `http://localhost:5180/playground/start` at a 1440×900 viewport.
Expected: identical to before **except** the compact scale — logo 263px wide (not 480), tighter gap to the tags, description capped at 420px, menu 44px below it. The HUD grid, background photo, blur, scrim, language corner, credits, printed-edition block and video player are all still there and unmoved. The column measures ~651px tall; nothing is clipped.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/screens/Start
git commit -m "refactor(ui): Start composes ScreenShell; column moves to the compact scale"
```

---

## Task 3: `playerOnly` availability

**Files:**
- Modify: `apps/ui/src/screens/Invite/Invite.tsx`
- Test: `apps/ui/src/screens/Invite/Invite.test.tsx` (create)

**Interfaces:**
- Produces: `SlotAvailability` becomes `'open' | 'playerOnly' | 'spectatorOnly' | 'full'`. Task 5 and Task 10 pass `'playerOnly'`.

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/screens/Invite/Invite.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import Invite, { type InviteCopy } from './Invite'

const COPY: InviteCopy = {
  logoAlt: 'Release',
  tags: ['tag'],
  description: 'description',
  formTitle: 'Game invite',
  codeLabel: 'game code',
  nicknameLabel: 'your nickname',
  nicknamePlaceholder: 'E.G. Dimbo',
  randomNick: 'random name',
  roleTitle: 'join as',
  rolePlayer: 'player',
  roleSpectator: 'spectator',
  spectatorOnlyNote: 'spectator only',
  noSlotsNote: 'no slots available',
  joinCta: 'connect',
  checkSlots: 'check slots',
  connecting: 'connecting',
  connected: 'connected',
  cancel: 'cancel',
  retry: 'retry',
  connectError: 'could not connect',
  fullStatus: 'no free slots',
  notFoundStatus: 'game not found',
  homePage: 'home page',
}

const PHYSICAL = {
  title: 'Printed edition',
  lead: 'lead',
  order: 'order',
  linkLabel: 'on Instagram',
  imageAlt: 'box',
}

const renderInvite = (availability: 'open' | 'playerOnly') =>
  render(
    <Invite
      code="F96-NMT"
      availability={availability}
      copy={COPY}
      physicalEditionCopy={PHYSICAL}
    />,
  )

it('leaves both roles selectable when slots are open', () => {
  const { getByText } = renderInvite('open')
  expect((getByText('spectator') as HTMLButtonElement).disabled).toBe(false)
  expect((getByText('player') as HTMLButtonElement).disabled).toBe(false)
})

it('disables the spectator role under playerOnly', () => {
  const { getByText } = renderInvite('playerOnly')
  expect((getByText('spectator') as HTMLButtonElement).disabled).toBe(true)
  expect((getByText('player') as HTMLButtonElement).disabled).toBe(false)
})

it('shows no availability note under playerOnly', () => {
  const { queryByText } = renderInvite('playerOnly')
  expect(queryByText('spectator only')).toBeNull()
  expect(queryByText('no slots available')).toBeNull()
})

it('joins as player under playerOnly even after clicking spectator', () => {
  const onJoin = vi.fn()
  const { getByText, getByDisplayValue, getByLabelText } = render(
    <Invite
      code="F96-NMT"
      availability="playerOnly"
      copy={COPY}
      physicalEditionCopy={PHYSICAL}
      onJoin={onJoin}
    />,
  )
  fireEvent.change(getByLabelText('your nickname'), { target: { value: 'Dimbo' } })
  expect(getByDisplayValue('F96-NMT')).toBeTruthy()
  fireEvent.click(getByText('spectator'))
  fireEvent.click(getByText('connect'))
  expect(onJoin).toHaveBeenCalledWith('Dimbo', 'F96-NMT', 'player')
})
```

Add `fireEvent` to the Testing Library import: `import { fireEvent, render } from '@testing-library/react'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/ui test Invite`
Expected: FAIL — the `playerOnly` cases fail because the spectator button is still enabled (`disabled` is `false`), and the last test reports `'spectator'` instead of `'player'`.

- [ ] **Step 3: Widen the type and the guards**

In `apps/ui/src/screens/Invite/Invite.tsx`, update the type and its comment block:

```ts
// Доступность слота по ссылке-приглашению — техническая ось «про форму»:
//   open          — есть места и игрока, и зрителя
//   playerOnly    — зритель недоступен (режим ещё не поддержан приложением):
//                   роль зафиксирована игроком, подписи нет
//   spectatorOnly — игрок занят, войти можно только зрителем (жёлтая подпись)
//   full          — мест нет вовсе: обе роли недоступны, жёлтая «нет доступных
//                   мест», действие — «проверить слоты» (без красной строки)
export type SlotAvailability = 'open' | 'playerOnly' | 'spectatorOnly' | 'full'
```

Below `const specOnly = …`, add:

```ts
  // зритель недоступен — обратная сторона spectatorOnly: роль зафиксирована
  // игроком, но подписи нет (это не «нет мест», а «режим ещё не поддержан»)
  const playerOnly = availability === 'playerOnly'
```

Change `effectiveRole` to honour it:

```ts
  // при spectatorOnly роль зафиксирована зрителем, при playerOnly — игроком
  const effectiveRole: JoinRole = specOnly ? 'spectator' : playerOnly ? 'player' : role
```

Add `playerOnly` to the spectator button's `disabled`:

```tsx
                  <button
                    type="button"
                    disabled={noSlots || playerOnly || busy}
                    className={`${styles.roleOpt} ${!noSlots && effectiveRole === 'spectator' ? styles.roleOptOn : ''}`}
                    onClick={() => setRole('spectator')}
                  >
                    {copy.roleSpectator}
                  </button>
```

The note's condition is left alone — it stays `{(specOnly || noSlots) && …}`, which is what makes `playerOnly` render no note.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @release/ui test Invite`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/screens/Invite
git commit -m "feat(ui): Invite gains playerOnly availability"
```

---

## Task 4: `Invite` composes `ScreenShell`

**Files:**
- Modify: `apps/ui/src/screens/Invite/Invite.tsx`
- Modify: `apps/ui/src/screens/Invite/Invite.module.css`

**Interfaces:**
- Consumes: `ScreenShell` from Task 1.
- Produces: no API change — `InviteProps` and `InviteCopy` keep their shape.

- [ ] **Step 1: Delete the moved rules from the stylesheet**

In `apps/ui/src/screens/Invite/Invite.module.css`, delete: `.root`, `.bg`, `.blur`, `.scrim`, `.root .bgLayer`, `.langShade`, `.langCorner`, `.content`, `.col`, `.about`, `.logo`, `.tags`, `.tag`, `.desc`, `.physical`.

Keep everything from `/* ===== область 2 — форма приглашения ===== */` onward unchanged: `.form`, `.fields`, `.fieldWrap`, `.formTitle`, `.role`, `.roleLabel`, `.roleOptions`, `.roleOpt`, `.roleOptOn`, `.note`, `.action`, `.actionError`, `.actionRow`, `.connecting`, `.connectingStatus`, `.connected`, `.joinIdle`, `.home`.

`.form` already carries `margin-block-start: 44px`, which is the gap `ScreenShell`'s `.desc` no longer provides. Leave it.

- [ ] **Step 2: Rewrite the component's frame**

In `apps/ui/src/screens/Invite/Invite.tsx`, remove the `LangSwitcher`, `PhysicalEdition`, `ReleaseLogo` and `HudBackground` value imports and the `INSTAGRAM_URL` constant, keeping the two types:

```tsx
import type { SwitchLang } from '@/blocks/LangSwitcher'
import type { PhysicalEditionCopy } from '@/blocks/PhysicalEdition'
import ScreenShell from '@/screens/ScreenShell'
```

Replace everything from `return (` through the closing `</div>` with:

```tsx
  return (
    <ScreenShell
      logoVariant={copy.logoVariant}
      tags={copy.tags}
      description={copy.description}
      lang={lang}
      onLangChange={onLangChange}
      physicalEditionCopy={physicalEditionCopy}
    >
      {/* область 2 — форма приглашения */}
      <section className={styles.form}>
        <h2 className={styles.formTitle}>{copy.formTitle}</h2>

        {/* поля ввода в контейнере фикс-высоты — высота учитывает жёлтую
            подпись: форма дышит внутри, а кнопки под контейнером не двигаются */}
        <div className={styles.fields}>
          {/* выбор роли — первым; в стиле полей ввода (лейбл + сегменты) */}
          <div className={styles.role}>
            <span className={styles.roleLabel}>{copy.roleTitle}</span>
            <div className={styles.roleOptions}>
              <button
                type="button"
                disabled={specOnly || noSlots || busy}
                className={`${styles.roleOpt} ${!noSlots && effectiveRole === 'player' ? styles.roleOptOn : ''}`}
                onClick={() => setRole('player')}
              >
                {copy.rolePlayer}
              </button>
              <button
                type="button"
                disabled={noSlots || playerOnly || busy}
                className={`${styles.roleOpt} ${!noSlots && effectiveRole === 'spectator' ? styles.roleOptOn : ''}`}
                onClick={() => setRole('spectator')}
              >
                {copy.roleSpectator}
              </button>
            </div>
            {(specOnly || noSlots) && (
              <span className={styles.note}>
                {noSlots ? copy.noSlotsNote : copy.spectatorOnlyNote}
              </span>
            )}
          </div>

          <div ref={nickRef} className={styles.fieldWrap}>
            <Input
              label={copy.nicknameLabel}
              value={nickname}
              onChange={(e) => setNickname(sanitizeNickname(e.target.value))}
              placeholder={copy.nicknamePlaceholder}
              maxLength={20}
              plain
              disabled={busy}
              trailing={
                <Button
                  variant="icon"
                  onClick={() => setNickname(randomNickname())}
                  aria-label={copy.randomNick}
                  title={copy.randomNick}
                >
                  <DiceIcon />
                </Button>
              }
            />
          </div>
          <div ref={codeRef} className={styles.fieldWrap}>
            <Input
              label={copy.codeLabel}
              value={codeValue}
              onChange={(e) => setCodeValue(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        {/* слот действия — фикс. высоты; статус сверху, действие снизу. Единый
            паттерн результата: ошибка / мест нет / не найдена — строка + кнопка */}
        <div className={styles.action}>
          {status && <span className={styles.actionError}>{status}</span>}
          <div className={styles.actionRow}>
            {connecting ? (
              <div className={styles.connecting}>
                <span className={styles.connectingStatus}>
                  <Spinner size={16} />
                  {copy.connecting}
                </span>
                {onCancel && (
                  <Button variant="tech" onClick={onCancel}>
                    {copy.cancel}
                  </Button>
                )}
              </div>
            ) : connected ? (
              <span className={styles.connected}>{copy.connected}</span>
            ) : (
              // одна и та же кнопка (всегда handleJoin — ник обязателен и для
              // проверки слотов); меняется лишь ярлык: проверить слоты / повторить
              // / подключиться, и статус-строка сверху
              <Button className={canJoin ? '' : styles.joinIdle} onClick={handleJoin}>
                {noSlots ? copy.checkSlots : status ? copy.retry : copy.joinCta}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* область 3 — уход на стартовый экран проекта */}
      <section className={styles.home}>
        <Button onClick={() => onHome?.()}>{copy.homePage}</Button>
      </section>
    </ScreenShell>
  )
```

- [ ] **Step 3: Run the package tests**

Run: `pnpm --filter @release/ui test && pnpm --filter @release/ui typecheck && pnpm --filter @release/ui stylelint`
Expected: all pass — Task 3's four `Invite` tests still hold, since none of them assert on the chrome.

- [ ] **Step 4: Verify visually**

Run: `pnpm dev:playground` and open `http://localhost:5180/playground/invite` at 1440×900.
Expected: pixel-identical to before this task. Step through every state selector (form / connecting / connected / failed / not found) and every availability (open / spectator only / no slots) — the action slot must not shift vertically between them.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/screens/Invite
git commit -m "refactor(ui): Invite composes ScreenShell"
```

---

## Task 5: `playerOnly` in the playground story

**Files:**
- Modify: `apps/playground/stories/InviteStory/InviteStory.tsx`

**Interfaces:**
- Consumes: `SlotAvailability` from Task 3.

- [ ] **Step 1: Add the option**

In `apps/playground/stories/InviteStory/InviteStory.tsx`, extend `AVAILABILITY`:

```tsx
const AVAILABILITY: { value: SlotAvailability; label: Loc }[] = [
  { value: 'open', label: { ru: 'игрок + зритель', en: 'player + spectator' } },
  { value: 'playerOnly', label: { ru: 'только игрок', en: 'player only' } },
  { value: 'spectatorOnly', label: { ru: 'только зритель', en: 'spectator only' } },
  { value: 'full', label: { ru: 'мест нет', en: 'no slots' } },
]
```

`STATES_DEFAULT` already applies to any availability other than `full`, so `changeAvailability` needs no change.

- [ ] **Step 2: Verify**

Run: `pnpm --filter @release/playground typecheck`
Expected: PASS.

Run `pnpm dev:playground`, open the invite story, select **only player**.
Expected: the spectator segment is dimmed and unclickable, "player" stays selected, and no yellow note appears. All five state options still switch normally.

- [ ] **Step 3: Commit**

```bash
git add apps/playground/stories/InviteStory/InviteStory.tsx
git commit -m "feat(playground): invite story covers the playerOnly availability"
```

---

## Task 6: Frontend `/start` composes `ScreenShell`

**Files:**
- Modify: `apps/frontend/src/pages/start.tsx`
- Modify: `apps/frontend/src/pages/start.module.css`

**Interfaces:**
- Consumes: `ScreenShell` from Task 1, exported from `@release/ui`.
- Produces: nothing — no other module imports this page.

This restores the HUD grid the ported copy dropped. It deliberately does **not** add the printed-edition block or the credits.

- [ ] **Step 1: Delete the ported chrome**

In `apps/frontend/src/pages/start.module.css`, delete `.root`, `.bg`, `.blur`, `.scrim`, `.content`, `.col`, `.logo`, `.tags` and `.desc`. Keep every other rule (`.menu`, `.hiddenSlot` and anything below them).

Replace `.menu` with:

```css
/* Menu sits on the logo's optical left edge; the top gap to the description
   belongs to the column body, since ScreenShell's description has no margin. */
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
import { Menu, MenuButton, MenuGroup, ScreenShell, VideoPlayer } from '@release/ui'
import { useGoToLobby } from '~/app/lib/lobbyNavigation'
import { useSession } from '~/app/providers/SessionProvider'
import { useModalRoute } from '~/shared/ui/ModalRouter'
import styles from './start.module.css'

const REPO_URL = 'https://github.com/dimbo-design/ReleaseBoardGameP2P'
const VIDEO_URL = 'https://www.youtube.com/embed/bxGtRnoYW4g?autoplay=1'

export default function StartPage() {
  const { t, i18n } = useTranslation()
  const handleMenuClick = useModalRoute()
  const session = useSession()
  const goToLobby = useGoToLobby()
  const hasSession = session.status === 'in-lobby' && !!session.state
  const logoVariant = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'

  return (
    <div className={styles.screen}>
      <ScreenShell
        logoVariant={logoVariant}
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

`AppLogo` and the `Typography` tag/description elements are gone — `ScreenShell` renders the logo and sets both through its own `composes`-based classes, which is why this page no longer needs `<Typography>` for them.

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter @release/web test && pnpm --filter @release/web typecheck && pnpm --filter @release/web stylelint`
Expected: all pass. `src/pages/__tests__/start.test.tsx` queries menu labels, which are unchanged.

- [ ] **Step 4: Verify visually**

Run: `pnpm dev` and open `http://localhost:5173/start`.
Expected: the compact column, and — new — the HUD grid over the background. The continue-session slot, the `?modal=create` / `?modal=join` / `?modal=rules` routing and the video player all behave as before. No printed-edition block, no credits.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/start.tsx apps/frontend/src/pages/start.module.css
git commit -m "refactor(web): /start composes ScreenShell, restoring the HUD grid"
```

---

## Task 7: `errorKind` on the session

**Files:**
- Modify: `apps/frontend/src/network/useLobby.ts`
- Test: `apps/frontend/src/network/useLobby.test.ts`

**Interfaces:**
- Produces: `UseLobby` gains `errorKind: ErrorKind`, where

  ```ts
  export type ErrorKind = 'not-found' | 'connection' | null
  ```

  re-exported through `~/entities/lobby`. Task 10 reads it; Task 11 sets it in the page-test fixture.

- [ ] **Step 1: Write the failing test**

`apps/frontend/src/network/useLobby.test.ts` currently only exercises the pure code-format
helpers — there is no transport mock and no hook harness. Add both at the top of the file,
below the existing import.

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

Then append the new tests:

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

Add to the `UseLobby` interface, next to `error`:

```ts
  errorKind: ErrorKind
```

Add the state, next to the `error` state:

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

In `onDisconnect`'s guest branch, both paths are connection failures:

```ts
        if (hostConnectedRef.current) {
          setError('disconnected: host left the lobby')
        } else {
          setError((prev) => prev ?? 'could not connect to the lobby')
        }
        setErrorKind('connection')
        setStatus('error')
```

Clear it in `leaveSession` (beside `setError(null)`) and in `clearError`:

```ts
  const clearError = useCallback(() => {
    setError(null)
    setErrorKind(null)
    setStatus((s) => (s === 'error' ? 'idle' : s))
  }, [])
```

Reset it at the top of `createRoom` and `joinRoom` beside their existing `setError(null)`.

Finally add `errorKind` to the returned object and to the `useMemo` dependency array.

- [ ] **Step 4: Re-export the type**

In `apps/frontend/src/entities/lobby/index.ts`:

```ts
export type { ErrorKind, PeerInfo, Role, UseLobby } from '~/network'
```

Check `apps/frontend/src/network/index.ts` re-exports `ErrorKind` from `./useLobby` too; add it if it lists its exports explicitly.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @release/web test useLobby`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/network apps/frontend/src/entities/lobby/index.ts
git commit -m "feat(web): classify session errors as not-found or connection"
```

---

## Task 8: `joinRoom` closes an existing transport

Without this, the invite screen's retry button strands a live peer on every attempt.

**Files:**
- Modify: `apps/frontend/src/network/useLobby.ts`
- Test: `apps/frontend/src/network/useLobby.test.ts`

**Interfaces:**
- Consumes: Task 7's changes to the same file.
- Produces: no API change.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/network/useLobby.test.ts`, reusing the `transports` array and
the `createTransport` mock Task 7 added to that file:

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
      // A retry (the invite screen reuses the same callback) would otherwise
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

## Task 9: `invite.*` copy

**Files:**
- Modify: `packages/translation/src/locales/en/common.json`
- Modify: `packages/translation/src/locales/ru/common.json`
- Modify: `apps/playground/stories/InviteStory/InviteStory.tsx`

**Interfaces:**
- Produces: the `invite.*` keys Task 10 reads. Types flow automatically — `packages/translation/src/i18next.d.ts` derives `CustomTypeOptions['resources']` from `en/common.json`, so adding keys there types them everywhere.

The shared column's copy is **not** duplicated here: `logoAlt`, the two tags and the description come from the existing `start.*` keys.

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
    "spectatorOnlyNote": "no player slots left — you can only join as a spectator",
    "noSlotsNote": "no slots available",
    "joinCta": "connect",
    "checkSlots": "check slots",
    "connecting": "connecting",
    "connected": "connected",
    "cancel": "cancel",
    "retry": "retry",
    "connectError": "couldn't connect",
    "fullStatus": "no free slots",
    "notFoundStatus": "game not found",
    "homePage": "home page"
  }
```

- [ ] **Step 2: Add the Russian block**

In `packages/translation/src/locales/ru/common.json`, add the same key:

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
    "spectatorOnlyNote": "мест игрока нет — доступно только подключение зрителем",
    "noSlotsNote": "нет доступных мест",
    "joinCta": "подключиться",
    "checkSlots": "проверить слоты",
    "connecting": "подключение",
    "connected": "подключено",
    "cancel": "отмена",
    "retry": "повторить",
    "connectError": "не удалось подключиться",
    "fullStatus": "мест нет",
    "notFoundStatus": "игра не найдена",
    "homePage": "главная страница"
  }
```

- [ ] **Step 3: Point the story at the catalog**

In `apps/playground/stories/InviteStory/InviteStory.tsx`, delete the whole local `COPY` constant and build it from the catalogs the file already imports:

```tsx
const COPY: Record<'ru' | 'en', InviteCopy> = {
  ru: {
    logoAlt: ruCommon.start.logoAlt,
    logoVariant: 'ru',
    tags: [ruCommon.start.tagOpenP2P, ruCommon.start.tagBoardCard],
    description: ruCommon.start.description,
    ...ruCommon.invite,
  },
  en: {
    logoAlt: enCommon.start.logoAlt,
    logoVariant: 'en',
    tags: [enCommon.start.tagOpenP2P, enCommon.start.tagBoardCard],
    description: enCommon.start.description,
    ...enCommon.invite,
  },
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @release/playground typecheck && pnpm --filter @release/translation typecheck`
Expected: PASS. A missing or misspelled key fails here, because `InviteCopy` requires every field.

Run `pnpm dev:playground`, open the invite story, toggle RU/EN.
Expected: every label reads as before. The logo, tags and description now come from `start.*`, so their wording matches the start screen exactly — that is the intended change.

- [ ] **Step 5: Commit**

```bash
git add packages/translation/src/locales apps/playground/stories/InviteStory/InviteStory.tsx
git commit -m "feat(translation): invite copy in the central catalog"
```

---

## Task 10: The `_InviteScreen` adapter

**Files:**
- Create: `apps/frontend/src/pages/lobby/_InviteScreen.tsx`
- Create: `apps/frontend/src/pages/lobby/_InviteScreen.module.css`
- Test: `apps/frontend/src/pages/lobby/__tests__/inviteScreen.test.tsx`

**Interfaces:**
- Consumes: `errorKind` from Task 7; `playerOnly` from Task 3; `invite.*` from Task 9; `useJoinLobby` from `~/features/join-lobby/useJoinLobby`; `useGoToLobby` from `~/app/lib/lobbyNavigation`.
- Produces: `InviteScreen` (default export, no props). Task 11 renders it.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/pages/lobby/__tests__/inviteScreen.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import type { UseLobby } from '~/entities/lobby'
import InviteScreen from '../_InviteScreen'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { resolvedLanguage: 'en' },
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

const joined = (peers: Record<string, unknown>): UseLobby => ({
  ...base(),
  status: 'in-lobby',
  roomCode: 'F96-NMT',
  state: {
    selfId: 'me',
    hostId: 'h',
    maxPlayers: 6,
    setup: {},
    peers,
  } as UseLobby['state'],
})

const renderScreen = () => render(<MemoryRouter><InviteScreen /></MemoryRouter>)

it('shows the form when there is no session', () => {
  sessionValue = base()
  renderScreen()
  expect(screen.getByText('invite.joinCta')).toBeTruthy()
})

it('shows the connecting state while connecting', () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web test inviteScreen`
Expected: FAIL — `Failed to resolve import "../_InviteScreen"`.

- [ ] **Step 3: Write the wrapper stylesheet**

Create `apps/frontend/src/pages/lobby/_InviteScreen.module.css`:

```css
/* Screen frame. ScreenShell (inside Invite) is block-size: 100%, so it needs a
   parent with a definite height — app.module.css only sets min-block-size. */
.screen {
  block-size: 100vh;
}
```

- [ ] **Step 4: Write the adapter**

Create `apps/frontend/src/pages/lobby/_InviteScreen.tsx`:

```tsx
import { useTranslation } from '@release/translation'
import { Invite, type InviteCopy, type InviteState } from '@release/ui'
import { useParams } from 'react-router'
import { useGoToLobby } from '~/app/lib/lobbyNavigation'
import { useSession } from '~/app/providers/SessionProvider'
import { useNavigate } from '~/app/router'
import { useJoinLobby } from '~/features/join-lobby/useJoinLobby'
import styles from './_InviteScreen.module.css'

// The invite screen (/lobby/:lobbyId with no live session yet). It maps the
// session status onto Invite's state axis and feeds it the catalog copy; all
// layout lives in @release/ui.
export default function InviteScreen() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const joinLobby = useJoinLobby()
  const goToLobby = useGoToLobby()
  const navigate = useNavigate()
  // On an invite link the code is in the URL; it pre-fills the field.
  const { lobbyId } = useParams()

  // Connected but the host's PEER_LIST hasn't landed yet: joinRoom seeds `peers`
  // with only the joiner, and applyPeerList swaps in the full roster (which
  // includes the host). So the host's absence IS "the roster hasn't arrived".
  // A host has selfId === hostId, so it never reads as connected.
  const rosterPending =
    session.status === 'in-lobby' && !!session.state && !session.state.peers[session.state.hostId]

  const state: InviteState =
    session.status === 'connecting'
      ? 'connecting'
      : session.status === 'error'
        ? session.errorKind === 'not-found'
          ? 'notFound'
          : 'failed'
        : rosterPending
          ? 'connected'
          : 'form'

  const copy: InviteCopy = {
    // The opening column is shared with the start screen, so its copy is too.
    logoAlt: t('start.logoAlt'),
    logoVariant: i18n.resolvedLanguage === 'ru' ? 'ru' : 'en',
    tags: [t('start.tagOpenP2P'), t('start.tagBoardCard')],
    description: t('start.description'),
    formTitle: t('invite.formTitle'),
    codeLabel: t('invite.codeLabel'),
    nicknameLabel: t('invite.nicknameLabel'),
    nicknamePlaceholder: t('invite.nicknamePlaceholder'),
    randomNick: t('invite.randomNick'),
    roleTitle: t('invite.roleTitle'),
    rolePlayer: t('invite.rolePlayer'),
    roleSpectator: t('invite.roleSpectator'),
    spectatorOnlyNote: t('invite.spectatorOnlyNote'),
    noSlotsNote: t('invite.noSlotsNote'),
    joinCta: t('invite.joinCta'),
    checkSlots: t('invite.checkSlots'),
    connecting: t('invite.connecting'),
    connected: t('invite.connected'),
    cancel: t('invite.cancel'),
    retry: t('invite.retry'),
    connectError: t('invite.connectError'),
    fullStatus: t('invite.fullStatus'),
    notFoundStatus: t('invite.notFoundStatus'),
    homePage: t('invite.homePage'),
  }

  return (
    <div className={styles.screen}>
      <Invite
        code={lobbyId ?? ''}
        // Spectator joining isn't supported yet: the host assigns the role
        // (assignRole) and the wire protocol carries no requested role.
        availability="playerOnly"
        state={state}
        copy={copy}
        physicalEditionCopy={t('physicalEdition', { returnObjects: true })}
        // `role` is ignored while playerOnly pins it to 'player'.
        onJoin={async (nickname, code) => {
          try {
            // A setup failure rejects here and is surfaced through
            // session.error/errorKind, so only navigate on success.
            const formatted = await joinLobby(code, nickname)
            goToLobby(formatted)
          } catch {
            // Already surfaced as `failed` / `notFound`; stay on the screen.
          }
        }}
        onCancel={() => session.leaveSession()}
        onHome={() => {
          session.leaveSession()
          navigate('/start')
        }}
        lang={i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'}
        onLangChange={(lang) => i18n.changeLanguage(lang)}
      />
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @release/web test inviteScreen`
Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/lobby/_InviteScreen.tsx apps/frontend/src/pages/lobby/_InviteScreen.module.css apps/frontend/src/pages/lobby/__tests__/inviteScreen.test.tsx
git commit -m "feat(web): invite screen adapter for /lobby/:lobbyId"
```

---

## Task 11: Wire the route

**Files:**
- Modify: `apps/frontend/src/pages/lobby/[lobbyId].tsx`
- Modify: `apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx`

**Interfaces:**
- Consumes: `InviteScreen` from Task 10, `errorKind` from Task 7.

- [ ] **Step 1: Update the page**

In `apps/frontend/src/pages/lobby/[lobbyId].tsx`, add the import:

```tsx
import InviteScreen from './_InviteScreen'
```

Remove the now-unused `JoinLobbyForm` import (it stays in the codebase for the start-screen join modal — only this page stops using it).

Inside the `session.status === 'in-lobby' && session.state` branch, after the `!continued` interstitial and before `return <LobbyView />`, add:

```tsx
    // The channel is open but the host's roster hasn't arrived; show the
    // invite screen's `connected` beat rather than an empty lobby.
    if (!session.state.peers[session.state.hostId]) return <InviteScreen />
```

Replace the whole final `return (…)` block — the `Shell`, the connecting line, the card with `JoinLobbyForm`, and the Back link — with:

```tsx
  return <InviteScreen />
```

`Shell`, `card`, `ghostBtn`, `label` and `styles` from `./_ui` are still used by the kicked/disbanded and interstitial branches above, so keep that import.

- [ ] **Step 2: Update the test fixture and the four pre-session tests**

In `apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx`, add `errorKind: null,` to `base()` next to `error: null,`.

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

The `t` mock in this file returns the key, so `i18n.resolvedLanguage` must exist on it. Update the mock:

```tsx
vi.mock('@release/translation', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'ru', resolvedLanguage: 'ru', changeLanguage: vi.fn() },
  }),
}))
```

Note `t('physicalEdition', { returnObjects: true })` returns the key string under this mock, which `PhysicalEdition` renders harmlessly — the tests don't assert on it.

Leave the other twelve tests untouched. Their `inSession()` fixture seeds `peers.h` against `hostId: 'h'`, so the new roster check resolves to `LobbyView` exactly as before.

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter @release/web test lobby`
Expected: PASS — all sixteen.

- [ ] **Step 4: Full verification**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass across every workspace.

- [ ] **Step 5: Verify end to end**

Run `pnpm dev:p2p` (frontend + local signaling server). In one browser create a lobby and copy its code. In a second window:

| Try | Expected |
|---|---|
| Open `/lobby/<valid-code>` | The invite screen, code pre-filled, spectator segment dimmed, no yellow note |
| Click connect with an empty nickname | The nickname field shakes; nothing else happens |
| Fill a nickname and connect | `connecting` with spinner and cancel, then a brief `connected`, then the lobby roster |
| Click cancel during connecting | Back to the form with the typed values still there |
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

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] Playground start story: compact column, chrome intact
- [ ] Playground invite story: unchanged visually; `playerOnly` present; action slot doesn't shift between states
- [ ] Frontend `/start`: HUD grid restored, modals and continue-session unchanged
- [ ] Frontend `/lobby/:lobbyId`: all five states, no raw PeerJS strings
- [ ] `/lobby/:lobbyId` kicked, disbanded and Continue/Leave branches unchanged
