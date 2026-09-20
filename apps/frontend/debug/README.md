# Board debug

## How a pass on this stand is reported

Every report about work done on this stand ends with two lists, and nothing
between them but the lists themselves (owner, 20.09):

1. **Modules not checked yet** — the animation modules whose use on the board has
   not been gone through. A module can be on it for two reasons, and they are not
   the same thing: nobody has looked at it, or it has been looked at and does not
   work. Say which.
2. **Card plays not reviewed yet** — the cards whose play has not been walked
   through on this stand against its playground scene.

No prose around either list. They are the state of the work, not an argument
about it: what is still open, at a glance, in the same place every time.

Run the frontend dev server (`pnpm dev`) and open `/debug.html` on its local URL.
This separate Vite HTML entry is for development; the normal production build
starts at `index.html` and does not include it.

The toolbar provides Cherry-pick, Rebase and System Upgrade, plus three
no-effect cases. Sudo sits in the hand of every preset whose card is still there
to be played, so one run covers the card with and without it — Cherry-pick and
Rebase had a second button each for exactly that and no longer need one. Follow the instruction beneath the toolbar
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

- **Security Bug: attack a fresh release:** the opponent has just played a release
  and its window is open; Security Bug is still in your hand. Attack the release
  with it — it moves into your own zone. The other half of the card, and the one
  the older presets could not reach: a release seeded into a zone has no reaction
  window, so there is nothing there to attack.
- **Security Bug: take a card from a hand:** your turn, nothing in any zone, the
  card in your hand. Play it at the opponent's hand and name a card — they hand
  it over, or they do not have it and the attack is simply spent.
- **Security Bug: request:** name Hotfix and confirm. The attack must remain at
  the centre throughout the request and successful handover.
- **Security Bug: duplicate hit:** starts at the request with two Hotfix copies.
  Name Hotfix and confirm: the first matching copy transfers automatically and
  the other stays in the opponent hand. Restart, select **View: observer**, then
  use **Resolve pending as its owner** to verify the named card flies publicly
  through the centre to the attacker without a donor gesture.
- **Bug: play and pick:** the same scene one step earlier — nothing is applied, so
  Bug is still in your hand. Pull it onto the opponent, then use **Resolve pending
  as its owner** to pass for them; their closed fan opens for you to pick from.
- **Bug: blind pick:** the attacker picks a position from the closed opponent fan.
  The attack remains staged until that pick resolves. Restart, select **View:
  observer**, then use **Resolve pending as its owner**: the observer sees the
  transfer and hand counts, but never the stolen card face or identity.
- **Attack / defence centre:** switch to the opponent and pull Hotfix onto the
  attack. Check that the empty cover slot does not intercept the attack hover;
  the played defence lands above it, with its own card tilt.
- **Release into a zone:** your turn, zones empty. Put the release down — pay its
  cost if the setup charges one, or play it with Code Review so the cost rides it
  instead. Monitoring is in the hand too, for the other thing that goes into a
  zone. The opponent holds a Bug and a Sudo, so the window the fresh release
  opens has something to answer it.
- **Error 503: the alarm / AI trigger: a Crush:** nothing has been drawn yet, and
  the trigger sits on top of the pile — both cards fire on the draw and never
  reach a hand. The 503 alarm stands because there are two ways to answer it, a
  Debugger in hand and a release to sacrifice. The AI preset seeds the events
  deck with a single card, so every run reveals the same Crush, aimed at the
  release standing in the zone.
- **Defences in the defender's hand:** every preset that throws an attack gives
  the defender every defence card, one copy each — Hotfix, Rubber ducky, PR
  approved, Rollback, Not a bug, Works on my machine. A stand is where you reach
  for the card you want to look at, so a card whose outcome some other card
  covers is not a card you can reach. The Security Bug presets keep their second
  Hotfix copy on top of that, for the duplicate-hit case.
- **The Bug family in the attacker's hand:** the play-and-pick preset carries
  Legacy Code and Out of Memory beside Bug. The rules give all three one effect,
  so the play is the same whichever is thrown — they are there to be thrown by
  name.
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
