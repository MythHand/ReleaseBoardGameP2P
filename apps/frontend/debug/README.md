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
pnpm --filter @release/web typecheck
pnpm --filter @release/web exec vitest run debug/scenarios.test.ts
pnpm exec release-lint check apps/frontend/debug
pnpm --filter @release/web stylelint
```

The frontend `typecheck` and `stylelint` scripts include `debug/`, so the regular
CI checks validate this entry as well as `src/`. The production build still uses
the application entry only.

## Centre and transfer regression presets (#154–157)

The additional presets start from seeded hands and reach intermediate decisions
through real `PLAY` / `RESOLVE` actions. Security Bug has two distinct Hotfix UIDs
in the opponent hand. The four attack presets add a third participant, Observer.
Their prelude is already settled when the Board mounts; it is not replayed as a
new attack animation. Restart resets the same card identities into a new game.

- **Security Bug: request:** name Hotfix and confirm. The attack must remain at
  the centre throughout the request and successful handover.
- **Security Bug: duplicate hit:** starts at the request with two Hotfix copies.
  Name Hotfix and confirm: the first matching copy transfers automatically and
  the other stays in the opponent hand. Restart, select **View: observer**, then
  use **Resolve pending as its owner** to verify the named card flies publicly
  through the centre to the attacker without a donor gesture.
- **Bug: blind pick:** the attacker picks a position from the closed opponent fan.
  The attack remains staged until that pick resolves. Restart, select **View:
  observer**, then use **Resolve pending as its owner**: the observer sees the
  transfer and hand counts, but never the stolen card face or identity.
- **Attack / defence centre:** switch to the opponent and pull Hotfix onto the
  attack. Check that the empty cover slot does not intercept the attack hover;
  the played defence lands above it, with its own card tilt.
- **Branch → 2 piles / Branch + Sudo → 3 piles:** start with one main pile and
  use the normal hand gestures. After resolution, main piles fill two rows down
  each column and AI stays bottom-left. All pile card boxes retain 150px width.

Viewer controls keep the same engine state but remount the Board from that
viewer's projection. Every event sent to the Board and the trace uses the same
`forViewer` audience filter/redaction as the P2P session; another player's action
payload is also hidden in the trace. The owner control is a manual debug action,
not an inactivity timer or a production rule. Existing operation presets retain
their two participants and opponent discard control.

Run the focused checks with `vitest run debug/scenarios.test.ts
debug/centreScenarios.test.ts` from `apps/frontend`; the standard typecheck and
stylelint commands above also cover these presets. Real browser geometry was
checked for 1/2/3 main piles with AI and No AI using the Board fixture; No AI mode
omits the AI grid cell rather than leaving an empty events pile.
