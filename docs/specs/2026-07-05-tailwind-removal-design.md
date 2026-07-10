# Tailwind Removal — Frontend Migration to CSS Modules + Design Tokens

**Date:** 2026-07-05
**Issue:** [MythHand/ReleaseBoardGameP2P#47](https://github.com/MythHand/ReleaseBoardGameP2P/issues/47)
**Status:** Approved

## Problem

The playground and the frontend app render the same screens differently. The
playground shows the ui-kit screens (`@release/ui` → `screens/Start`,
`screens/Lobby`), styled with CSS Modules + design tokens. The frontend
re-implements those screens by hand with Tailwind utility classes, and the two
have drifted apart. The frontend also violates its own rules in places
(hardcoded `#8fd9b0` / `#ff6b81` instead of the `--mint` / `--coral` tokens).

## Decision

Unify on the ui-kit approach everywhere. Remove Tailwind from `@release/web`
entirely; the frontend styles its pages with co-located CSS Modules consuming
the design tokens from `@release/ui/tokens.css` — the same approach as
`@release/ui` and `@release/playground`.

For the screens that exist in the ui-kit (Start incl. its modals, Lobby), the
**visual source of truth is the ui-kit screen styles as shown in the
playground** — not the frontend's current Tailwind look. The frontend keeps its
own markup, routing, session wiring, and i18n; only the styling is ported.

### Scope boundaries

- **In:** all Tailwind usage in `apps/frontend` (11 `.tsx` files, ~86
  `className` usages, `src/app/index.css`), Tailwind tooling (deps, Vite
  plugin, stylelint allowances), and the docs that state the Tailwind rule.
- **Out:** refactoring the ui-kit screens into controlled components and
  consuming them directly from the frontend. That is the durable fix for the
  duplication and remains a candidate follow-up issue, but it touches the
  ui-kit's component contracts and is deliberately not part of this migration.
- **Out:** any change to frontend behavior, routing, i18n, or the P2P layer.

## Styling architecture

Each frontend component/page gets a co-located `*.module.css` (e.g.
`pages/start.module.css` next to `start.tsx`), following ui-kit conventions:

1. Colors, fonts, timings, z-index only via tokens — `var(--mint)`,
   `var(--font-mono)` — never raw values. Missing a color → add a token to
   `apps/ui/src/design/tokens.css`, don't inline it.
2. Spacing and sizing as plain px values (the token set has no spacing scale;
   Tailwind scale values convert to their px equivalents, e.g. `px-4` →
   `padding-inline: 16px`).
3. Logical properties (`padding-inline-start`, `inset-inline-end`) — already
   enforced by stylelint (`csstools/use-logical`).
4. `composes: … from '../design/typography.module.css'` is allowed where a
   text style matches an existing typography class; otherwise plain
   properties. No restructuring of text into `<Typography>` in this migration.

`src/app/index.css` becomes a small plain-CSS global file:

5. Keep: the view-transition keyframes (already plain CSS).
6. Remove: `@import "tailwindcss"` and the whole `@theme` bridge — CSS Modules
   read the token custom properties directly, no bridge needed.
7. Move: the `@utility start-blur-mask` / `@utility start-scrim` blocks become
   regular classes in the start page's module; the scrim uses the existing
   `--grad-scrim` token (identical gradient).

## Conversion map

Style source per file — JSX structure, hooks, and behavior stay untouched;
only `className` values change from utility lists to module classes:

8. `pages/start.tsx`, `app/AppModals.tsx`, `features/create-lobby/
   CreateLobbyForm.tsx`, `features/join-lobby/JoinLobbyForm.tsx` → styles
   ported from `apps/ui/src/screens/Start/Start.module.css` (the ui Start
   screen includes the create/join/rules modals, so their styling comes from
   there too).
9. `pages/lobby/_LobbyView.tsx`, `pages/lobby/[lobbyId].tsx`,
   `pages/lobby/_ui.tsx` → styles ported from
   `apps/ui/src/screens/Lobby/Lobby.module.css` and its blocks (`PlayerSlot`,
   `LobbyCode`, `LangSwitcher`).
10. Where frontend markup differs structurally from the ui screen (kebab menu,
    session-driven states), keep the frontend markup/behavior and adapt the
    ported styles so the visual result matches the playground aesthetic.
11. Pages with no playground counterpart — `pages/help.tsx`, `pages/404.tsx`,
    `pages/_app.tsx`, `shared/ui/ErrorScreen.tsx`, `shared/ui/AppLogo.tsx`,
    `shared/ui/LanguageSwitch.tsx` — get a mechanical Tailwind → CSS Modules
    conversion of their current styles. Page-private helpers may share the
    page's module.

Special cases:

12. Hardcoded colors (`#8fd9b0`, `#ff6b81`, `white/xx` alphas) → existing
    tokens `--mint`, `--coral`, `--white-*` (exact same values).
13. Arbitrary values (`px-[18px]`, `top-[calc(100%+6px)]`,
    `grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]`) → written directly in CSS.
14. Conditional classes (ready/danger/self states) → base module class + state
    class toggled in JSX, the same pattern the ui-kit uses.
15. `bg-[url(@/assets/home/photo.jpg)]` → `background-image:
    url("@/assets/home/photo.jpg")` in the module; Vite resolves the `@` alias
    (→ ui-kit src) in CSS `url()`, and the alias stays.
16. `className` passed into ui-kit components (`<AppLogo>`, `<Slider>`) keeps
    working — the prop now receives a module class.

**Intended visual change:** the start and lobby pages will visibly change to
match the playground. That is the point of the unification, not a regression.

## Tooling removal

17. Remove `tailwindcss` and `@tailwindcss/vite` from
    `apps/frontend/package.json`; remove the `tailwindcss()` plugin from
    `apps/frontend/vite.config.ts`.
18. Clean `packages/lint/stylelint.config.json`: drop the Tailwind at-rules
    (`theme`, `tailwind`, `apply`, `utility`, `variant`, `custom-variant`,
    `source`, `plugin`, `config`, `reference`) from `ignoreAtRules`, so
    stylelint catches any reintroduction.

## Docs updates

19. Root `CLAUDE.md`: rewrite the Styling Rule to a single approach — CSS
    Modules + design tokens everywhere. The frontend section loses "Tailwind
    first", the `@theme` bridge bullet, the Tailwind stylelint bullet, and the
    stale `NO_TAILWIND.md` link (the file does not exist). Overview and Stack
    Per App lose their Tailwind mentions.
20. `apps/frontend/CLAUDE.md`: flip "never `*.module.css`" to the co-located
    module convention; reword "Colors are design tokens only" to plain
    `var(--*)` usage (no `@theme` bridge); "pages add layout/Tailwind only" →
    layout modules only.
21. `README.md` and
    `.claude/agent/engineering/engineering-frontend-developer.md`: same
    Tailwind → CSS Modules updates where mentioned.

## Verification

22. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all green.
23. `grep -ri tailwind` over the repo (excluding the lockfile and this spec)
    returns nothing.
24. Manual review side-by-side against the playground: run `pnpm dev:all`,
    compare the frontend `start` and `lobby` pages (including modals and the
    kebab menu) against `StartStory` / `LobbyStory`. Pages without a
    playground counterpart are checked against their previous appearance.

## Risks

25. **Style duplication remains.** The screen styles now live in two places —
    the ui-kit screens and the frontend modules — so future drift is still
    possible. The durable fix (frontend consumes the ui-kit screens as
    controlled components) is out of scope here and should be filed as a
    follow-up issue.
26. **Ported styles meet different markup.** The ui screen CSS assumes its own
    DOM structure; adapting it to the frontend's markup is judgment work, not
    copy-paste. The side-by-side playground comparison in verification is the
    guard.
