# apps/playground — `@release/playground`

Vite sandbox that renders `@release/ui` components in isolation (CSS Modules only). **Additive** to the root [CLAUDE.md](../../CLAUDE.md).

## The Demo Area Rule

What a story shows lives inside **its own area**, and that area is the window
minus everything the playground puts around it: the navigation on the left, and
the technical bar above. Nothing the story draws — not an overlay, not a modal,
not a video — is ever allowed outside it. The playground's own furniture is not
something the demo is entitled to cover.

That is why the technical bar is a **row of the page**, never a layer over it: a
bar that floats cuts the demo area down without the demo knowing by how much.
Every scene is built like [`TableStory`](stories/TableStory/TableStory.tsx):

```
.root    display: flex; flex-direction: column; block-size: 100vh; overflow: hidden
<TechBar>  flex: 0 0 auto — the technical line, a ROW of the page
.stage     position: relative; flex: 1; min-block-size: 0; overflow: hidden
```

`.stage` **is** the demo area. Consequences, all of them the point of the rule:

- anything the scene paints over itself — a scrim, an elimination video, an edge
  glow, confetti — is `inset: 0` of the stage. Nothing measures the bar's height
  at runtime, because there is nothing to measure;
- inside the stage, positions are the Table screen's own values, copied from
  [`Table.module.css`](../ui/src/table/Table/Table.module.css) — no "+62px so it
  clears the bar" offsets anywhere;
- the screen's own background comes with it: the `surface-0` fill, the 28px
  techno grid, and `HudBackground` as a full-area layer.

**A showcase page has a demo area too.** A `Modal` is `position: fixed` because
in the game covering the whole screen is right; on its kit page it must not
swallow the navigation. The fix is never to change the primitive — it is to give
the page a bounded stage with `contain: paint`, which makes that box the
containing block for the fixed overlay. See
[`ModalsKit`](stories/kit/ModalsKit.module.css).

**The flight carriers are the one exception.** `useFlyer`, `useHandArrival`,
`useDiscardExit`, `Arrow` and the hand's drag layer are `position: fixed` against
the viewport because they fly by coordinates read from `getBoundingClientRect`.
Do not "contain" them: a containing block anywhere above them shifts every flight
by the width of the navigation.

## Technical Bar Rule

The bar and everything in it comes from [`stories/controls/`](stories/controls/) —
never hand-rolled per story. `TechBar` is the row; inside it go `TechButton`
(an action), `TechToggle` (a two-state condition), `TechSwitch` (a small closed
set), `HoverSelect` (a long list), `TechLabel` (names a control), `TechHint`
(what the scene expects of you) and `TechField` (groups a caption with its
control so a wrap can never separate them).

- **Restart is first**, at the top-left of the bar, and it is called `рестарт` /
  `restart` — not "сброс", not "сброс состояния". The only thing allowed left of
  it is navigation between scenes on one page (the git-card selector), because
  that sits a level above the scene it restarts.
- Need a shape the set does not have? Add it to `controls/`, then use it. A
  local copy is how the same button ended up in twelve module.css files.

## Typography Rule

- **All text goes through `<Typography>` from `@release/ui`** — never hand-written font CSS on text in stories or scaffolding. Full rule: [apps/ui/CLAUDE.md](../ui/CLAUDE.md#typography-rule).
