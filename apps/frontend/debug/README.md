# Board debug

Run the frontend dev server (`pnpm dev`) and open `/debug.html` on its local URL.
This separate Vite HTML entry is for development; the normal production build
starts at `index.html` and does not include it.

The toolbar provides base and Sudo variants of Cherry-pick, Rebase, and System
Upgrade, plus three no-effect cases. Follow the instruction beneath the toolbar
and use the real board gestures. For Upgrade, the opponent discard button appears
only when that opponent owes a card. The action/event disclosure shows the last
command and the engine's response, including rejections.

Selecting any scenario, including the selected one, or clicking Restart creates
a new game identity and remounts the complete board. The seeded card identities
repeat deliberately; local hand order, staged cards, intro state, and event
history reset for every run. The debug entry does not create a peer connection or
read/write the application's saved session.

Fixtures represent an already dealt match, so no opening deal is invented. Play
and resolution use the same engine and projection adapter as the application.
The countdown and action timestamps use the current clock. Reaction windows
expire through the engine; turn inactivity does not auto-play a preset. After the
turn countdown reaches zero, actions remain manual. Opponents have no automatic
strategy.

Checks from the repository root:

```sh
pnpm --filter @release/web exec release-tsc --noEmit -p debug/tsconfig.json
pnpm --filter @release/web exec vitest run debug/scenarios.test.ts
pnpm exec release-lint check apps/frontend/debug
pnpm --filter @release/web exec stylelint 'debug/**/*.css'
```
