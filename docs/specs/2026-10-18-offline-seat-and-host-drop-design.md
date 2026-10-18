# Offline seats, host network drops and mid-match spectators

Issue: not opened yet — open one before branching (`feat/<n>-offline-seat`).

Status: design, approved by the owner in conversation on 2026-10-18; not implemented.

## Intent

A networked match must survive people losing their connection. Today two things
go wrong:

1. When the **host's** network drops (tab still open), every guest loses the
   session and never gets it back — even after the host's network returns.
2. When a **player's** connection drops, a bot takes over their seat after 30
   seconds and plays their hand for them. The owner does not want that: an
   absent player should not make decisions, good or bad. Their seat becomes
   **passive** — the game keeps it moving by fixed rules, it can be attacked, it
   cannot defend.

Separately, someone who was not seated in the running match and opens the room
should land as a spectator when a spectator place is free.

The three parts are independent and can ship as separate PRs. Part 3 is the
core of this design; parts 1 and 2 are edge-case fixes.

## Non-goals

- Keeper election / host migration. If the host is gone, the table waits for the
  host; nobody else takes over keeping the table.
- Changing behaviour of **lobby-chosen bots** (the `bots` setting). A seat that
  was a bot from the start stays a bot with the current policy. Only seats of
  disconnected humans change.
- Changing the 30-second absence grace or any turn/window duration.
- Pausing the table for a hidden tab.

## Anti-goals

- The passive seat must never play a card from hand, attack, or choose to
  defend. If any path lets the old bot policy act for an absent human, the
  feature has failed even if the table keeps moving.
- A guess written as a rule. Every passive-seat behaviour below was confirmed by
  the owner; anything not listed goes to `docs/rules/backlog.md` as an open
  question, not into code.

---

## Part 1 — host network drop (edge case)

### Why it breaks today (found by reading code, not reproduced live)

- `createTransport` (`apps/frontend/src/network/transport/peer.ts`) never listens
  for PeerJS `peer.on('disconnected')` and never calls `peer.reconnect()`. When
  the host's network drops, PeerJS loses the signaling broker; the host's peer id
  — which **is** the room code — stops being registered, and guests dialing it
  get `peer-unavailable`. When the network returns nothing re-registers it.
- The host's `onError` (`useLobby.ts`, `onError`) puts the host's own session
  into `status: 'error'` for signaling errors (`network`, `disconnected`).
- There is no `online` listener anywhere in the frontend.
- The guest reconnect loop (`runGuestReconnect` in `useLobby.ts`; constants in
  `session/reconnect.ts`) gives up after `MAX_RECONNECT_ATTEMPTS = 5` with backoff 0.5→1→2→4 s — roughly 15–20 s
  including dial time — then sits in `failed` until the player presses retry.
- The only host recovery path is `restoreHost`, which runs after a **page
  reload**. "Tab alive, network blinked" has no path.

### Required behaviour

- Host, tab alive, network lost then back: the host re-registers the **same**
  peer id with the broker and keeps keeping the table from the state it already
  holds in memory. Guests' dials then succeed and their resume tokens put them
  back in their seats, exactly as after a host reload.
- The host's session must not drop to `error` for a transient signaling loss.
  The board shows the existing "reconnecting" connection indicator meanwhile.
- Guests keep retrying for about **two minutes** before showing `failed` (builder
  picks the curve; the 8 s cap is fine). Retry and leave stay available
  throughout. *(Two minutes is Claude's call, not the owner's.)*
  `MAX_RECONNECT_ATTEMPTS` also bounds `restoreHost`'s `unavailable-id` retry
  loop; give the guest loop its own limit rather than stretching the host's.
- While the host's signaling is down the keeper **freezes**: it does not run
  `advanceSession` (no deadlines, no passive turns) and does not accept the
  host's own moves. This is not automatic today — the host's tab keeps ticking,
  guests' channels close, `disconnect` stamps `absentSince`, and 30 s later they
  would be played passively during an outage that is the host's, not theirs.
- When the host is back, every non-host seat that is absent gets a fresh grace,
  as `restoreSeats` does after a reload, and live clocks resume with the time
  they had left. *(Freeze + fresh grace are Claude's calls.)*

### Left to the builder

- Whether to use `peer.reconnect()` on the existing `Peer` or to tear down and
  recreate the transport with the same id (the `restoreHost` retry loop already
  handles `unavailable-id`). Either is fine if the in-memory session survives.
- Whether the guest's existing DataChannel survives a short blip (WebRTC can
  outlive a signaling loss). If it does, nothing should tear it down.

---

## Part 2 — joining a running match as a spectator (edge case)

### Required behaviour

A person who has **no seat** in the running match (no matching resume token)
opens the room:

- spectator place free → admitted as spectator and shown the board as a spectator;
- no spectator place → refused with the existing `room-full`.

A person who **has** a seat in this match always goes back to that seat, never
to spectators.

### Current state

`resolveJoinAdmission` / `getJoinAvailability` (`network/lobby/admission.ts`)
already refuse a player place while `matchRunning` and admit a spectator when one
is free; the invite screen (`pages/lobby/_InviteScreen.tsx`) disables the player
button in that case. So the gap is somewhere in the end-to-end flow, not in the
admission rule. The builder must reproduce it first (two browsers, start a match,
open the invite link in a third) and fix what actually fails. Places worth
checking: the flow after `restoreHost` (is `matchRunning` true there?), a joiner
who explicitly requested `player`, and where the joiner is routed after
admission (lobby vs board). If the invite screen still makes the person choose,
the owner's intent is that they simply land as a spectator — no dead "join as
player" choice.

---

## Part 3 — passive seat instead of a bot

### When a seat becomes passive

- A human's connection drops → the seat is absent (`absentSince` set), as today.
- For `ABSENT_GRACE_MS` (30 s, unchanged) the table waits as it does today; if
  it is their turn, the turn waits.
- After the grace the seat is **passive**. This replaces the branch in
  `driveUnattended` (`network/session/referee.ts`) that currently runs
  `botAction` for an absent human. Lobby-chosen bots (`seat.bot`) keep
  `botAction`.

### What a passive seat does — owner's rules

| Situation | Passive seat |
|---|---|
| Its own turn | No turn clock. It immediately draws (the mandatory draw, one card from each draw pile, as normal) and then `PUSH`es. **Nothing is played from hand.** |
| Cards drawn | Go to hand as normal. |
| Triggers/AI events drawn | Resolve by game logic (below). |
| Hand limit at end of turn (`mode.hand` = 8 bit / Memory Problem) | Excess cards discarded **at random**. At the end of every passive turn the hand is within the mode's limit. |
| Attack on its release or hand (`defend` pending) | Does not defend; the attack succeeds. Cards in hand that could cancel it are not spent. |
| Reaction window opened by someone else | Neither attacks nor passes by choice — it simply does not take part (a `PASS` is fine if the window needs every responder to answer). |
| Security Bug on its hand (`giveCard`) | Rules decide: the named card is given if held, otherwise a miss. No choice involved. |
| Error 503 / AI Error 503 from its draw (`neutralize503`) | Standing Monitoring (`protection-monitoring` or `ai-monitoring`) blocks it automatically. Note: for `ai-error-503` the engine today opens a `neutralize503` pending with `monitoring` among `methods` instead of blocking by itself (`triggers.ts`, `ai-error-503` case), unlike `trigger-error-503` and `ai-crush-*`; the passive answer is then `monitoring`. The mismatch with `cards.md` goes to `docs/rules/backlog.md`. Otherwise the player is **eliminated at once**. Debugger in hand is **not** spent; **no** release is sacrificed. |
| AI Crush from its draw (`crush`) | Same as 503: standing Monitoring blocks it automatically; otherwise the release is lost. No Debugger, no sacrifice. |
| AI Bad Vibe-Coding from its draw (`handLimit`, `endsTurn: false`) | A **random** card is discarded. |
| System Upgrade played by someone else (`systemUpgrade`, discarding phase) | A **random** card is discarded. |
| AI Inside from its draw (`pickFromDiscard`) | A **random** eligible Release is taken from the discard. |
| AI Hallucination from its draw | Ends the turn as normal (rules already say so). |

Monitoring counts as "something that defends by itself" — rules already say it
fires with no choice (`docs/rules/cards.md`, Error 503 method 2 and AI Crush).
That is the only protection a passive seat has.

Declining a neutralization is legal: `docs/rules/cards.md` §Error 503 says a
player may decline and be eliminated even holding a Debugger.

Pending kinds that arise from a card the player **played** — `discardForRelease`,
`stealCard`, `requestCard`, `reorderTop`, the `systemUpgrade` picking phase, a
played-card `pickFromDiscard` — never start while the seat is passive (it plays
nothing). They **can** be open when the player drops mid-decision; today only
`botAction` resolves them after the grace (`tick` does not fire their deadlines
against an empty seat). Handling: see "Dropping mid-decision" below.

### Dropping mid-decision

Owner's answer: **the played card goes back to the player's hand.** When the
grace runs out on a seat that owes a decision raised by a card it played, the
play is undone and the seat then continues as passive (draws if it has not, then
`PUSH`es if it is its turn).

| Pending | Undone as |
|---|---|
| `discardForRelease` | The release (and a declared `support-code-review`) returns to hand; nothing is discarded. It was not a successful release, so the turn's release limit is not spent (`resolution.md`: the limit counts success, not attempt). |
| `stealCard` / `requestCard` (Bug / Security Bug on a hand) | The attack card (and its Sudo, if one rode it) returns to hand; nothing is taken. |
| `reorderTop` (Git Rebase) | Git Rebase (and Sudo) returns to hand; deck order unchanged. |
| played-card `pickFromDiscard` | The played card (and Sudo) returns to hand; nothing is taken from the discard. |
| `systemUpgrade`, picking phase (sudo) | **Exception — not undone.** The others have already thrown their cards, so the play completes: a **random** one of the thrown cards goes to the player's hand, the rest to the discard as usual (owner's answer). |

The other players see the card return as a public event (the card was shown at
the centre while it was being played). Animation follows the existing modules
(`docs/animations/`); a missing movement goes to the animation backlog.

### Leaving on purpose

Owner's answer: a player who presses "leave" during a match **surrenders and is
eliminated** at once — the same `eliminate` path as a 503 (hand and zone leave
the board; an AI card goes back to the events deck). Their seat does not become
passive. If that leaves one living player, the match ends as usual. Only a lost
connection makes a seat passive.

### Winning while passive

Owner's answer: **a passive seat can win.** No special win rule: if its draws
complete a release set (e.g. through `ai-release-*`) or it is the last player
standing, it wins like anyone else.

### Randomness

"Random" must come from the engine's own seeded entropy (as `botAction` does with
`randomAt(state.seed, state.eventSeq)`), so a replay of the log reproduces the
same discards and picks. Never `Math.random` in the keeper.

### When the player comes back

- They `rebind` to their seat with the hand that accumulated, already within the
  hand limit, and play on normally from that moment.
- If it is their turn when they return, they get the turn with a normal turn
  clock (today's `rebind` already restarts an expired clock — keep that).
- If they were eliminated while passive (503 without Monitoring), they come back
  eliminated and watch the match like any eliminated player.

### What the table shows

The passive player's place is marked "offline" on the board, so others
understand why an attack went through undefended. The marking is the builder's
design (within the `@release/ui` rules); the copy goes into both translation
catalogs. Whether the existing "reconnecting" signal already covers this is for
the builder to check.

### Pacing

A passive turn (draw → push) should still be visible to the others, not
instantaneous: reuse the presentation/bot pacing gates that bot turns already go
through (`botReady`, `presentResult`). The exact pause is the builder's call.

### Where the code goes (suggested, builder may differ)

- A `passiveAction(engine, state, me, at)` next to `botAction` in
  `packages/engine/src/fake/` — the engine owns which choices are legal and how
  random ones are drawn. It answers only the kinds in the table above; the
  `neutralize503`/`crush` "decline" answer may need a new choice variant if the
  engine has none (today `methods` is `debugger | monitoring | sacrifice`; with no
  methods `eliminate` already runs directly).
- `driveUnattended` picks `botAction` for `seat.bot`, `passiveAction` for an
  absent human past the grace.
- The `giveCard` auto-resolution in `tick` stays as it is.

### Rules documentation

Per `CLAUDE.md`, the passive-seat rules are owner decisions, not inferences.
Record them in `docs/rules/decisions/` (a dated file with the questions and the
owner's answers from this conversation) and add a new section on disconnection to
`docs/rules/general.md` (none exists today) that points at them, so the spec stays the
single source checked against.

---

## Testing

- Engine: `passiveAction` per pending kind, including hand-limit random discard
  determinism, and that it never returns `PLAY`/`ATTACK`.
- Referee: an absent human past grace is driven passively; a `seat.bot` still
  plays with `botAction`; a passive seat with Monitoring survives a drawn 503,
  without it is eliminated even holding Debugger.
- Session: host transport loss and return keeps the session and lets a guest
  rebind (memory network in `session/memoryNetwork.ts`); guest retries span
  ~2 minutes.
- Undo on drop mid-decision: one test per pending kind in the table above; the
  card is back in hand and the table moves on.
- Leaving mid-match eliminates at once; the last remaining player wins.
- Part 2: an end-to-end test of a third peer opening a running room.

## Calls made by Claude (not the owner)

- While the host's signaling is down the keeper freezes; on the host's return
  absent guests get a fresh grace.
- For `ai-error-503` with Monitoring standing, the passive seat answers
  `monitoring` (the engine/rules mismatch goes to the rules backlog).
- A Sudo that rode a play undone on disconnect returns to hand together with it.

- Guest retry window of about two minutes.
- Host offline time does not count towards guests' absence (restamp like a restore).
- A passive seat simply does not take part in other players' reaction windows.
- Pacing of passive turns reuses bot pacing.
- `passiveAction` lives in the engine next to `botAction`.
