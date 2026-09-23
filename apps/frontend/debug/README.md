# Board debug

> **Working on this stand?** Read [WORKFLOW.md](./WORKFLOW.md) first — the loop,
> how decisions are split, and how a pass is reported. This file is the stand
> itself; that one is how the work on it runs.

## The rule this stand exists for: NOTHING HERE IS ITS OWN

The stand mounts the real `Board`, the real engine and the real projection. It
has no code of its own and must never grow any. That is the whole point of it:
what you see on any page is what a real match does, and a fix made against one
page is a fix every page inherits on reload.

So a defect found here is **never fixed where it was found**. It is fixed in the
thing that is shared, and every place that had its own copy of that thing is put
on the shared one in the same pass (owner, 22.09).

**What a private piece looks like** — three shapes, all of them found on this
board already:

- a movement written out inside a beat when a module for it exists (a card
  travelling to a place at the centre, a card leaving for the discard, a card
  returning to a hand);
- the same movement written out in two beats, with no module yet — then the
  module is what the pass produces, and both beats call it;
- a number copied by hand out of a module (a duration, a layer), instead of the
  module being asked for it.

**Why the rule is absolute rather than a preference.** A private copy does not
announce itself. It behaves until the next page opens the same movement from a
different side, and then the same defect is reported again, as if it had never
been fixed — which is exactly what it means to fix a copy. The owner pays for
that twice: once in the session that fixes it, once in the session that finds it
again.

## Before a fix: the analysis, and what it is compared against

No fix starts before the analysis, and the analysis is not "what I think is
wrong". It answers, in this order:

1. **What the code actually does now** — read, not remembered, and named by file.
2. **What the playground does** — the reference scenes are the approved behaviour
   (`apps/playground/stories/...`). A difference from them is the defect; an
   agreement with them is not one, however odd it looks. Reworking something the
   reference already settled is how a fixed scene comes back broken.
3. **What the spec says** — the rules (`docs/rules/`) for what happens, the
   animation spec (`docs/animations/`) for how it moves and which module owns it.
4. **Which shared thing is missing or unused** — the answer the fix is then made
   in.

A step skipped here is a step paid for later: the last four defects on this stand
were all one of "the module exists and was not used" or "the reference already
says otherwise".

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
Rebase had a second button each for exactly that, and System Upgrade kept its
one until 22.09; none of them needs it. Follow the instruction beneath the toolbar
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
- **DDoS: the standing zone:** your turn, five DDoS in hand, and two opponent
  zones already holding one of each thing a DDoS can aim at. The first seat has a
  Monitoring, a bare release and a release under Code Review; the second has the
  AI pair, an AI Monitoring and an AI release, because an AI card leaving a zone
  goes home to the events deck rather than to the discard — its own condition and
  its own road off the table. DDoS is the one attack played on your own turn
  against what is already standing, rather than into a reaction window, and the
  one attack Code Review does not stop. The zones are written standing rather
  than played into place: the throw is what this preset is for, and every card in
  them would otherwise cost a turn of its own to put there.
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
- **Branch + Merge + Sudo:** the pile cards in one hand — two Branch, one Merge
  and three Sudo — starting from a single main pile, played with the normal hand
  gestures. Split the pile, split it again, then put every pile back together,
  with or without a Sudo each time: Branch with Sudo also turns the discard into
  a pile of its own, and Merge with Sudo takes the discard back in before
  shuffling. Two buttons used to cover the split alone, and Merge had no preset
  at all; the row of piles gets real pressure only when it goes up and down
  several times in one run. After resolution, main piles fill two rows down each
  column and AI stays bottom-left. All pile card boxes retain 150px width.

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
