# Bot pacing, presentation acknowledgements, and relative seating (#226)

Date: 2026-10-15

Issue: https://github.com/MythHand/ReleaseBoardGameP2P/issues/226

Status: written specification approved by the owner; implementation plan awaiting review.

## Intent and success criteria

Make games with multiple bots readable for every player, including a non-host
whose board renders more slowly than the host's. A bot must not run through
several actions while that player is still watching the first one. Players must
receive their full decision time after the relevant state has been presented.
Every player must see the same circular seating order from their own position.

Keep the sequential board shadow and the existing shared animation modules.
Verify the reported fresh-release attack and AI Crush symptoms in a real
non-host session; neither is established as an engine defect by the issue.

## Evidence and scope

Baseline inspected: `main@3e9f291d` (0.10.1).

- `network/session/link.ts` ticks every 250 ms. `advanceSession` can drive an
  unattended seat on each tick.
- `network/session/startGate.ts` and `remoteLink.ts` gate the opening only.
  There is no acknowledgement for ordinary board presentation.
- `features/board-beats/useBeats.ts` serializes animations and temporarily renders
  a shadow. Dropping the shadow would remove intentional sequential presentation.
- `network/session/referee.ts` owns deadline processing and authoritative action
  timestamps. Engine reductions currently stamp clocks before remote animation
  completion is known.
- `packages/engine/src/fake/project.ts` filters the viewer out of seating without
  rotating the circle. Board adapters and rendering preserve that array order.
- `docs/animations/backlog.md`, “Боты опережают анимации и видимый таймер хода”,
  already records the pacing and lost-visible-time problem.

The issue's scheduler and browser observations are prior evidence, not new
reproductions performed while writing this specification.

Included: pacing, presentation acknowledgement, decision-clock activation,
current-turn consistency, relative seating, and browser investigation of the two
unconfirmed symptoms. Excluded: bot target strategy (#225), clock-offset
correction (#228), unrelated refactoring, and a rewrite of hidden-tab recovery
(#143). Coordinate with those changes where interfaces overlap.

## Approved product decisions

1. There are at least 2,000 ms between successive bot actions. Animation waiting
   overlaps this interval; it does not add a further two seconds after completion.
2. Before the next automatic bot action, wait for presentation of the relevant
   state by connected human players, including the host's own player seat.
3. Each presentation wait expires 12,000 ms after the host sends that state.
   Disconnect removes a player from that wait immediately. Spectators never
   block progress. Hidden or stalled clients cannot block indefinitely.
4. A newly established decision clock starts with its full existing duration
   after presentation acknowledgement or the presentation cap. This includes
   reaction windows and the human turn following a bot.
5. A player whose own presentation is complete may act before the collective
   wait ends. The host validates against current state; an accepted action
   supersedes the previous wait. Rejected actions do not extend time.
6. Preserve the real circular order by stable player IDs. For seating
   `[p1,p2,p3]`, p2 is below and sees `[p3,p1]` above, left to right. Renaming,
   disconnecting, and elimination do not reorder the original places.

These timing changes are explicit owner decisions made during this conversation,
not deductions from the tabletop rules. Durations and card-resolution rules are
unchanged. Record these decisions beside the existing animation finding during
implementation, including the corresponding Interaction audit entry.

## Selected approach and alternatives

A fixed two-second delay does not account for a slow non-host. Waiting only for
the host's board has the same limitation. Use acknowledgements from connected
player boards for a specific authoritative presentation instead.

The session remains authoritative; clients report presentation progress only.
They do not choose game timestamps, apply rules, or extend a deadline directly.

## Presentation identity and lifecycle

Each state-changing publication carries a presentation identity scoped to the
match and keeper incarnation, with an ordered revision. This is separate from
event IDs: recipient event feeds are private and may omit events, and a state
transition need not produce an animation for every recipient.

The host captures the connected human player connections expected for that
publication before delivering it, including synchronous delivery to itself.
Acknowledgements identify the match and presentation; sender identity comes
from the current connection. Ignore unknown, stale, duplicate, future, and
superseded acknowledgements. An old connection cannot acknowledge for its
replacement. Reconnection does not add a new obligation to an existing wait;
the restored board joins subsequent waits normally.

An accepted action supersedes the current presentation. A resulting state may
create its own wait, with its own fixed cap. Rejected intents, retransmissions,
and duplicate acknowledgements do not reset the cap or bot interval. A later
state that replaces an earlier batched state is acknowledged only after all
animation work required to present it has settled.

Cancel waits on close, rematch, and keeper replacement. A new keeper incarnation
invalidates old acknowledgements and establishes presentation from its adopted
state. Restore must retain elapsed active clock time rather than treating every
reload as a new decision with a fresh allowance; a pending presentation wait
must retain its original bound or be released conservatively if its progress
cannot be recovered. No recovery path grants repeated fresh 12-second waits.

## Board completion contract

Carry presentation metadata through SYNC accumulation, `useGame`, and Board
without changing event audience filtering or rejection handling. A board reports
completion only after its event batch has been incorporated, the relevant beat
queue is drained, and the committed board presents the corresponding live state.
Do not infer completion from `running === false` alone: an arriving batch can
still be waiting to be queued on that render.

Use the same completion contract for host and guest, local sessions, reduced
motion, resync, and state changes with no animation. Restore acknowledges a
committed restored state without replaying historical events. Initial intro
continues to use its existing gate; the two gates must neither deadlock nor
grant duplicate clock activation.

Completion concerns state presentation, not an open decision surface waiting for
input. A prompt awaiting a card or confirmation must not prevent the clock for
that very decision from starting. Existing hidden-tab handling must not falsely
claim that suspended animation work was presented; the cap remains the fallback.

## Scheduling and clocks

Keep the 250 ms ticker: it also maintains deadlines and absence handling.
Gate unattended actions separately. The first bot action after intro or a human
action receives the same two-second thinking interval; consecutive bot actions
also remain at least two seconds apart. Only a successful state-changing bot
action consumes a bot action slot. Ordinary human intents are not delayed by
the bot interval.

Represent presentation waiting explicitly in the authoritative timing model and
projection. A new or normally renewed decision allowance is pending until its
presentation is released; it must not carry an apparently active countdown
whose deadline can expire while waiting. On release, the host establishes the
existing full duration and publishes the active clock. Clients display waiting
before that publication and the normal countdown afterwards.

Clock activation itself creates no animation or new presentation wait. It does
not reset the bot interval. Retain existing relationships between turn, window,
and pending clocks: only activate allowances that the current rules actually
establish or renew. An unrelated presentation must not restart an already active
window. A superseded decision must never have its old clock activated later.
The host validates early human answers against the live decision even while its
clock is awaiting activation. Deadline expiry runs only for active clocks.

Put explicit clock operations beside the existing engine timing model and call
them from the session boundary; do not scatter ad hoc deadline rewrites through
Board or transport handlers. Keep engine/session time authoritative. Clock-offset
conversion is a separate task and must not become an implicit part of this fix.

## Visible state and action legality

Seat highlighting and TurnDock must agree on the state currently being shown.
Preserve shadow sequencing while animation is in progress. Once the queue has
drained, both must match the latest authoritative turn and decision phase.
Input readiness must respect the local presentation and existing decision
surfaces, while final submission legality reads current authoritative data.
In particular, a gesture crossing an opening or expiring attack window must
recheck the current window and target on release.

## Relative seating

For a seated viewer, rotate the immutable seating circle to that viewer and
project the remaining seats in successor order. The existing top row renders
that list left to right; the viewer sits below. For spectators retain the
canonical seating order because there is no self position to rotate around.
Keep eliminated seats in their original positions and preserve all player IDs.
Do not rebuild positions from names, the live peer roster, or active players.

## Validation and acceptance

Use controlled-clock session tests for the 2,000 ms minimum, slow non-host,
12,000 ms cap, host participation, disconnect, excluded spectators, zero
animations, repeated/stale/future acknowledgements, reconnection, keeper change,
and rematch. Cover local links as well as keeper/remote links.

Test clock activation after normal completion and cap, full reaction and turn
allowances, early human answers, non-resetting active clocks, supersession,
deadline expiry, and restored timing. Test that publication of active clocks
does not introduce another wait. Keep private events and rejection channels
separate throughout.

Use Board integration tests for batched SYNC, delayed queue completion, an
arriving unqueued batch, reduced motion, restore, and final agreement of Seat,
TurnDock, and action eligibility. Test circular projection for every viewer in
three-to-six-player seating, plus spectator, renamed, and eliminated cases.

Record browser evidence from a real host/non-host WebRTC session with at least
two bots, including deliberately slowed non-host presentation. Capture action,
rejection, window, revision, acknowledgement, and queue timing as needed.

For the fresh-release attack, record a live legal window, an available attack,
Code Review conditions, expiration, and the final mouseup decision. For Crush,
record the AI subtype, release owner, Monitoring/AI Monitoring, Debugger choice,
and destruction/neutralization events. A successful debug scene or unit test
alone does not establish either non-host scenario. If reproduction is blocked,
report the exact missing evidence instead of claiming the symptom fixed.

Run relevant engine/session/Board tests, type checks, lint, and the project checks
required by the eventual implementation. Review shared Board/animation behavior;
do not introduce private bot-only animation paths. Record per-symptom results and
any unverified criteria in the eventual PR.

## Handoff

After owner review of this written specification, create the implementation plan
using the writing-plans workflow. Product implementation has not started as part
of this design stage.
