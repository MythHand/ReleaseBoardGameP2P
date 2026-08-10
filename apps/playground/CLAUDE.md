# apps/playground — `@release/playground`

Vite sandbox that renders `@release/ui` components in isolation (CSS Modules only). **Additive** to the root [CLAUDE.md](../../CLAUDE.md).

## Page Shell Rule

A story that shows a **whole game screen** (the table and everything on it) is
built like [`TableStory`](stories/TableStory/TableStory.tsx), and nothing else:

```
.root    display: flex; flex-direction: column; block-size: 100vh; overflow: hidden
.controls  flex: 0 0 auto — the technical line, a ROW of the page
.stage     position: relative; flex: 1; min-block-size: 0; overflow: hidden
```

The technical line belongs to the **playground**, never to the screen. It takes
its own height as a row; the stage below is the screen and owns everything left.
Consequences, all of them the point of the rule:

- inside the stage, positions are the Table screen's own values, copied from
  [`Table.module.css`](../ui/src/table/Table/Table.module.css) — no "+62px so it
  clears the bar" offsets anywhere;
- anything the scene paints over the screen (an overlay, a video, confetti) is
  `inset: 0` of the stage. No measuring the bar's height at runtime;
- the screen's own background comes with it: the `surface-0` fill, the 28px
  techno grid, and `HudBackground` as a full-area layer.

The single-move scenes (Error 503, Defense Release, …) predate this and float
their bar over the table with hardcoded offsets. **They are not the reference** —
unifying them is a separate pass.

## Typography Rule

- **All text goes through `<Typography>` from `@release/ui`** — never hand-written font CSS on text in stories or scaffolding. Full rule: [apps/ui/CLAUDE.md](../ui/CLAUDE.md#typography-rule).
