# Start Screen Primitives — Design Spec

**Date:** 2026-06-23

## Overview

Add four new primitives to `apps/ui/src/primitives/`, extend one existing primitive, then use them to build a router-integrated Start screen in `apps/frontend` and upgrade the lobby forms.

---

## 1. Primitives (`apps/ui/src/primitives/`)

### 1.1 `Menu` + `MenuButton`

**Location:** `apps/ui/src/primitives/Menu/`

Files: `Menu.tsx`, `MenuButton.tsx`, `Menu.module.css`, `index.ts`

#### `Menu`

Renders `<nav role="menu">` with a flex-column layout. Owns:

- `refs: useRef<RefObject<HTMLButtonElement | null>[]>([])` — each `MenuButton` pushes its ref on mount via `registerItem`
- `activeIndex: number` state (default `0`)
- `MenuContext` providing `{ activeIndex, setActiveIndex, registerItem }`

`onKeyDown` on the nav element:
- `ArrowDown` → `next = (activeIndex + 1) % count` → `setActiveIndex(next)` + `refs.current[next].current?.focus()`
- `ArrowUp` → `prev = (activeIndex - 1 + count) % count` → `setActiveIndex(prev)` + `refs.current[prev].current?.focus()`
- `Enter` — handled natively by the focused `<button>`, no extra logic

Context default is `null` (not inside a `MenuContext.Provider`).

#### `MenuButton`

Dual-mode component — auto-detects whether it is inside a `<Menu>` by reading `useContext(MenuContext)`:

**Inside `<Menu>` (context non-null):**
- Calls `registerItem(ref)` in a `useState` initializer → gets stable `myIndex`
- `tabIndex={activeIndex === myIndex ? 0 : -1}` (roving tabIndex)
- `role="menuitem"`
- `onFocus={() => setActiveIndex(myIndex)}` — keeps mouse/Tab focus consistent with arrow state

**Standalone (context is `null`):**
- `tabIndex={props.tabIndex ?? 0}`
- `role="button"`
- No registration, no index

Visual style in both modes: `[ TEXT ]` brackets — left and right bracket `<span>`s flanking a label `<span>`, monospace uppercase, same hover opacity as `Button` primary. Uses its own `Menu.module.css` (does not depend on `Button` internals).

`index.ts` exports both `Menu` (default) and `MenuButton` (named). Both added to `apps/ui/src/index.ts`.

---

### 1.2 `ModeSelect` — add `disabled` prop

**Location:** `apps/ui/src/primitives/ModeSelect/ModeSelect.tsx` (updated in-place)

New prop: `disabled?: boolean`

Behaviour:
- All option `<button>` elements receive `disabled={true}` when `disabled` is set (removes from tab order, prevents click)
- Track element gets a `.disabled` CSS class: `opacity: 0.4`, `pointer-events: none`, `cursor: not-allowed`
- The sliding thumb stays at the current `index` position but is dimmed by the parent opacity
- `readOnly` prop remains unchanged (shows selection without dimming — used for guest lobby view)

Priority when both are set: `disabled` takes precedence over `readOnly`.

---

### 1.3 `InputField`

**Location:** `apps/ui/src/primitives/InputField/`

Files: `InputField.tsx`, `InputField.module.css`, `index.ts`

```tsx
interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode
}
```

Renders:
```tsx
<label className={styles.field}>
  <span className={styles.label}>{label}</span>
  <input className={styles.input} {...rest} />
</label>
```

CSS (`InputField.module.css`) matches the inline pattern from `Start.module.css`:
- `.field`: `display: flex; flex-direction: column; gap: 8px`
- `.label`: `font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; opacity: 0.55`
- `.input`: `padding: 14px 16px; font-family: var(--font-mono); font-size: 18px; color: #fff; text-transform: uppercase; letter-spacing: 0.14em; background: rgb(255 255 255 / 5%); border: 1px solid rgb(255 255 255 / 18%); outline: none`
- `.input:focus`: `border-color: var(--brand-green)`

Exported from `InputField/index.ts` and added to `apps/ui/src/index.ts`.

---

## 2. Frontend Start Screen (`apps/frontend/src/pages/start.tsx`)

Replaces the current simple placeholder. Builds the polished Start screen using the new primitives, wired to React Router.

### Styling approach

Per project rules, no new `*.module.css` in the frontend. Layout and standard utilities are Tailwind inline classes. Complex effects that cannot be expressed inline are added to `apps/frontend/src/app/index.css` as `@utility` entries:

- `.start-blur-mask` — `backdrop-filter: blur(11px)` with CSS mask gradient (fades right)
- `.start-scrim` — `background: linear-gradient(90deg, ...)` dark-to-transparent
- `.start-player-*` — the expand-to-player animation classes (`transition: inline-size 380ms ...`)

### Asset imports

Via the `@` alias (resolves to `apps/ui/src/`):
- `import ReleaseLogo from '@/brand/ReleaseLogo'`
- `import MYTHHAND from '@/assets/brand/mythhand.svg'`
- Background image via `bg-[url(@/assets/home/photo.jpg)]` Tailwind arbitrary value

### Modal state

```tsx
const [params, setParams] = useSearchParams()
const modal = params.get('modal') // 'create' | 'join' | 'rules' | null
const openModal = (name: string) => setParams({ modal: name })
const closeModal = () => setParams({})
```

`Modal` from `@release/ui` receives `open={modal === 'create'}` etc. No changes to `Modal.tsx`. Back button closes the modal (removes the param from URL).

### Actions

```tsx
<Menu>
  <MenuButton onClick={() => openModal('create')}>{t('start.createGame')}</MenuButton>
  <MenuButton onClick={() => openModal('join')}>{t('start.joinGame')}</MenuButton>
  {/* visual gap via margin on the next item */}
  <MenuButton onClick={() => openModal('rules')}>{t('start.rules')}</MenuButton>
  <MenuButton onClick={() => window.open(REPO_URL, '_blank', 'noopener')}>{t('start.github')}</MenuButton>
</Menu>
```

Single `Menu` — arrow navigation flows through all four items. The secondary pair (Rules, GitHub) is separated visually with a `margin-block-start` on the third item via a wrapper `<div>` inside the menu or a CSS gap variant.

### Create modal

- `InputField label={t('start.nicknameLabel')}` for nickname, `maxLength={20}`
- `ModeSelect` for each of the five `GAME_MODES` (same setup as `Start.tsx` in ui)
- `Button` to submit (`t('start.createCta')`)
- On submit: calls `useCreateLobby(name.trim(), 4)` then `navigate('/lobby')`
- `SessionProvider` is available at this route (wraps the whole app via `_app.tsx`)

### Join modal

- `InputField label={t('start.nicknameLabel')}` for nickname
- `InputField label={t('start.gameCodeLabel')}` for game code
- `Button` to submit (`t('start.joinCta')`)
- On submit: calls `useJoinLobby(code.trim(), name.trim())` then `navigate('/lobby')`

### Rules modal

- Imports `Rules` directly from `@/screens/Start/Rules` (not in the package index — accessed via the `@` alias)

### Video player

Carried over as-is from `apps/ui/src/screens/Start/Start.tsx`: `videoMounted` / `videoOpen` state, `onPlayerTransEnd` handler, the expand/collapse animation. Styles go in `index.css` as `@utility` entries.

---

## 3. Lobby Form Updates

### `apps/frontend/src/pages/lobby/_CreateForm.tsx`

- Replace the two `<label className={field}><span className={label}>…</span><input className={input} …/></label>` blocks with `<InputField label={…} …/>` from `@release/ui`
- Replace the `<button type="submit" className={primaryBtn}>` with `<Button>` from `@release/ui`
- The `<select>` for max players and the `<details><summary>` game modes block stay unchanged in this pass

### `apps/frontend/src/pages/lobby/_JoinForm.tsx`

- Replace both label+input pairs with `<InputField>` from `@release/ui`
- Replace `<button type="submit" className={primaryBtn}>` with `<Button>` from `@release/ui`

---

## 4. Exports

All new primitives added to `apps/ui/src/index.ts`:

```ts
export { default as Menu, MenuButton } from './primitives/Menu'
export { default as InputField } from './primitives/InputField'
```

`ModeSelect` export unchanged (updated in-place).

---

## 5. Modal — Focus Trap + ARIA

Updates to `apps/ui/src/primitives/Modal/Modal.tsx`.

### Focus trap

On open, `Modal` must keep keyboard focus inside the dialog until it is closed.

1. **Save return target:** on mount, capture `document.activeElement as HTMLElement` in a `returnRef` (plain ref, not state).
2. **Initial focus:** when `shown` becomes `true`, query `button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])` inside the `<dialog>` and focus the first result; fall back to the `<dialog>` itself (add `tabIndex={-1}` to the dialog element).
3. **Tab cycle:** `keydown` listener on the `<dialog>` element intercepts `Tab` / `Shift+Tab`. If the focused element is the last focusable child and Tab is pressed, wrap to the first; if focused is the first and Shift+Tab is pressed, wrap to the last. `e.preventDefault()` only on the wrap cases.
4. **Restore focus on close:** after the exit animation completes and `setMounted(false)` fires, call `returnRef.current?.focus()`.

### ARIA

- Add `aria-labelledby` on `<dialog>` pointing to an `id` on the title `<span>` (generated with `useId()`).
- Add `aria-modal="true"` on `<dialog>`.

---

## Out of Scope

- Adding `ModeSelect` to the lobby forms' game modes section (the `<details>` block stays as-is)
- Updating the `apps/ui/src/screens/Start/Start.tsx` to use the new primitives (the playground story continues to use the existing implementation)
