# Keeper-relative countdowns with round-trip sampling

Issue: [#228](https://github.com/MythHand/ReleaseBoardGameP2P/issues/228)

Status: proposed design, awaiting written-spec approval.

## Intent and scope

A non-host player must see the same remaining turn, reaction-window and timed
decision durations as the keeper, within the uncertainty of network transport.
Different system clocks, including a clock changed during play, must not produce
3553 seconds or a premature zero for a live 30-second turn. Only the keeper
decides whether a deadline has elapsed and whether an action is accepted.

The owner selected round-trip measurement with monotonic interpolation. This
change covers the existing session links and their Board consumer. It does not
change game durations, pause the table for a hidden tab, fix animation catch-up
(#143), alter bot pacing (#226), or implement automatic keeper election.

## Existing behavior and confirmed failure

At main `3e9f291d`, `referee.ts` stamps actions and deadlines using keeper time.
`remoteLink.ts` forwards projections without a clock conversion. `useNow.ts`
reads the client's `Date.now()`, and shared `Table/dock.ts` subtracts it from
keeper deadlines. The sync design already identifies this mismatch in
`2026-07-30-p2p-sync-layer-design.md`, Trust boundary.

The actual keeper → in-memory transport → remote link → adapter → clock hook →
dock diagnostic produced 30 seconds with equal clocks, 3553 with a client 3523
seconds behind, and zero with a client 60 seconds ahead. This establishes the
clock-domain defect; it does not prove the original player's machine settings.

## Design boundaries

Keep engine projections, action timestamps, event history and persisted
GameState in their existing keeper time domain. Do not rewrite deadline fields
per recipient. The UI receives a clock in that same domain instead.

Add a small clock model under `network/session/` with injectable monotonic time,
sampling and lifecycle tests. It owns calibration only, not game rules or
transport. `remoteLink` owns requests, sender checks and scheduling. Keeper and
local links expose the same clock interface without a network round trip.

`GameLink` exposes a clock with:

- `now(): number | null`: estimated current keeper time, or unavailable before
  the first trusted timing anchor;
- `subscribe(listener): unsubscribe`: notification when calibration changes;
- a stable calibration snapshot/revision for React subscription, so a new
  sample can update a mounted countdown without a fabricated SYNC/event batch.

`useGame` exposes this clock to the page. `useNow` reads it synchronously on
render and ticks every 250 ms only while `isCounting` is true. Its interval uses
the same clock rather than a cached local epoch. `SyncSnapshot` continues to
accumulate projections and events, without persisting calibration or mixing
clock-only updates into event history. The link retains calibration while the
Board is unmounted.

## Clock exchange

Add two game-scoped messages to the existing `Message` union:

- `CLOCK_REQUEST { gameId, requestId }`;
- `CLOCK_RESPONSE { gameId, requestId, receivedAt, sentAt }`.

Both response timestamps come from the same injected keeper clock used for
actions. The client stores its own monotonic send time; it is not supplied by
the response. On receipt, the client captures its monotonic receive time.

For client timestamps `c0`, `c3` and keeper timestamps `k1`, `k2`:

```text
networkRtt = (c3 - c0) - (k2 - k1)
keeperAtReceipt = k2 + networkRtt / 2
estimatedNow = keeperAtReceipt + (performance.now() - c3)
```

This assumes roughly symmetric paths. It is an estimate, not a guarantee of
exact one-way latency. With path asymmetry, error is half the forward/reverse
delay difference. Queueing outliers are reduced by sample selection.

Keep at most eight valid samples from the last 30 seconds. Use the lowest RTT
sample and advance it from its original monotonic receive anchor; do not reset
its age when another response arrives. Equal RTT samples prefer the newest.
Discard non-finite timestamps, negative computed RTT, `sentAt < receivedAt`,
unknown/consumed request IDs, and responses over five seconds old.

Start with three probes spaced 250 ms apart, then probe every ten seconds.
Limit outstanding requests to three and expire them after five seconds.
Schedule the first request only after the remote handle is installed and
message routing is active; an immediately responding in-memory transport must
not race handle initialization. Closing a link cancels every probe timer.

## Initial display and fallback

Stamp each outgoing SYNC at link delivery with `gameId` and `keeperNow`, from
the keeper's injected clock. This covers ordinary fan-out, resync, rejection,
spectator and local delivery paths without introducing `Date.now()` inside the
pure referee. An initial trusted SYNC provides a provisional anchor at local
receipt; before the first RTT sample it may lag by that message's delivery time.

Once RTT calibration exists, ordinary SYNC frames must not replace it with the
less accurate receive-time anchor. SYNC still supplies a fallback after an
explicit reset. A clock awaiting any trusted anchor displays a full numberless
ring; it must never fall back to subtracting the client's epoch. This uses the
existing ring representation and needs no new product copy or loading screen.

Compatibility: the fields are additive. An old client can ignore new timing
metadata; a new client receiving legacy SYNC without timing metadata shows a
numberless ring until a supported clock exchange succeeds. Action eligibility
continues to come from projections. Supporting old peers must not resurrect
the original incorrect epoch subtraction.

Calibration corrections apply on the next render. A better measurement may
correct the displayed number in either direction; do not clamp time globally
to decrease, because a new action legitimately starts a new deadline. The
existing countdown still clamps remaining time and ring progress at zero.

## Lifecycle, trust and routing

The active game ID is passed to the remote handle and reset by the existing
GAME_STARTING/reconnect paths. Rematch reuse of a remote link must start a new
clock generation even when peer IDs are unchanged. Request IDs are unique for
the handle's lifetime, including game/keeper resets.

The keeper answers only requests for its active game from a connected seated
player or registered spectator. It does not send GameState, hand data or player
identity in clock responses. The remote accepts responses only from its current
keeper, for the active game and an outstanding request in the current local
generation. `parseEnvelope` does not validate payloads, so these guards operate
on untrusted runtime values before arithmetic.

Route the two message types through `useLobby` to the existing keeper/remote
handles. They are not intents, do not call the reducer and do not restart turn
clocks. A rejected or malicious timestamp cannot extend an authoritative
deadline. A departed keeper no longer answers probes.

Reset samples and outstanding requests on disconnect/reconnect, game change,
`setKeeper`, or close. Late replies from a previous generation are ignored,
including when the same peer reconnects. After a reset, take a new trusted SYNC
anchor and repeat the initial probe burst. On visibility return, request a new
burst without pausing or restarting authoritative timers. Between samples,
local wall-clock changes have no effect on the displayed countdown.

The keeper clock itself is anchored once to its supplied epoch and then advanced
with monotonic elapsed time during an attached session. Its reducer, outgoing
SYNC stamps and clock responses must all use that same clock. Local links use
the same abstraction without compensation. This avoids changing one clock while
leaving the authority on another after a system-time adjustment.

## Keeper changes and restoration

`setKeeper` invalidates the old calibration and remeasures the new endpoint.
Existing lower-level voluntary handover APIs are testable, but `KEEPER_STATE`
currently has no production adoption receiver. Do not add one for this issue.

For an exercised lower-level handover, capture the successor's calibrated
estimate in the outgoing keeper's time domain before resetting the remote
clock. Seed the successor's authoritative monotonic clock from this estimate
when attaching it to the adopted GameState. Existing openedAt/deadline values
then keep their meaning, without rebasing event history or giving extra time.
The caller must pass the seed explicitly; do not infer it from the largest
deadline or silently use the successor's different wall clock. Tests cover
that adoption contract and remeasurement by a remaining peer.

Host reload on the same keeper remains the existing restoration policy: create
a fresh epoch anchor from current time, so time spent offline still counts.
Calibration is never persisted across page reloads. Recovering from an offline
system-clock change or long OS suspension is not solved by RTT compensation;
after wake, obtain fresh samples/state before claiming a synchronized countdown.

## Validation and acceptance

1. Pure clock tests use independently controlled keeper and client monotonic
   sources: no skew, ±60 seconds, −3523 seconds, wall-clock jumps, elapsed time
   between receive/render, timeout, outlier selection and asymmetric delay.
2. Actual keeper/remote links over the memory transport test 30-second turns,
   15-second windows and timed decisions. With symmetric 100 ms paths, the
   estimate must match keeper time within deterministic test precision. With
   asymmetry, assert the documented half-difference bound, not exact equality.
3. Exercise timing on ordinary SYNC, empty-event clock-start SYNC, rejection,
   resync and spectator delivery. Clock updates never duplicate history or
   animate events again. React batching/remount keeps the current clock.
4. Forged senders, malformed payloads, wrong games, duplicate/late replies,
   rematches, same-peer reconnect and close cannot adopt stale calibration or
   leak timers. Verify a clock reply cannot change reducer state/deadlines.
5. Lower-level keeper handover preserves remaining time with different machine
   epochs. Existing host restore semantics and local/solo links still work.
6. Browser check: two actual clients with controlled guest Date.now skew,
   including −3523 seconds and +60 seconds, observe the same turn/window.
   Change the guest clock mid-turn and return from background; new sampling
   must recover without renewing expired deadlines. Record whether transport
   is actual WebRTC or an in-memory browser harness; neither stands for the other.
7. Run relevant network/hook/page tests, full project tests, typecheck, lint and
   production build. Report any environment-limited browser/transport evidence.

Implementation remains one #228 branch/PR. The clock model, link lifecycle,
wire routing and page hookup are inseparable parts of the same fix; unrelated
network orchestration refactoring is excluded.
