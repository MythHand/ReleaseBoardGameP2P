# P2P networking — Design

**Date:** 2026-06-22
**Project:** ReleaseBoardGameP2P ("Release любой ценой")
**Scope:** The peer-to-peer networking layer that lets one user host a game and others join — lobby, roles, connection topology, and the in-game message protocol. Game-rules evaluation and screen UI are out of scope here (separate specs).

> This spec covers **networking + protocol only**. The game-rules engine (card resolution logic) and the game screens consume this layer but are designed separately.

## Goal

Let a user create a room and host other players directly from the browser, with no game backend. Players connect peer-to-peer via WebRTC; the host acts as the connection hub and relay. The existing `apps/backend` signaling server is removed in favour of PeerJS-hosted signaling.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Host's game role | **Facilitator** — host has no authority over rule *validation*; game state lives on peers |
| 2 | Signaling | **PeerJS** (hosted or self-hosted `peerjs-server`); `apps/backend` is deleted |
| 3 | Topology | **Star through host peer** — non-host peers hold one DataChannel (to host); host relays |
| 4 | Shuffle | **Host generates the seed** and shuffles (seeded PRNG); reproducible from seed |
| 5 | Join UX | **Link primary, room code fallback** — `?room=<peerId>`, short code `ABC-123` |
| 6 | Event ordering | **Turn-authority** (Approach B) — current turn player is mini-authority for their turn; ACK-based attack windows; full-state checkpoint at turn end |
| 7 | Roles | **Host / Player / Guest** — three connection roles |
| 8 | Role assignment | **Auto** — player by default; guest when player slots are full |
| 9 | Max players | **Host-configured 2–6** in the lobby |
| 10 | Host admin | Host can **kick** players and **transfer host** to another peer |

## Roles

- **Host** — room creator, connection hub, relay, and also a player in the game. Configures `maxPlayers`, can kick players, can transfer the host role. No authority over rule validation.
- **Player** — full participant: has a hand, takes turns, can attack and defend.
- **Guest** — spectator: sees public state (board, played cards, deck size, events) in read-only mode, has no hand, takes no turns.

**Assignment:** automatic. On join, if `playerCount < maxPlayers` the joiner becomes a `player`; otherwise a `guest`. No manual host assignment.

## Topology

Star through the host peer. Non-host peers open exactly one DataChannel — to the host. The host relays messages between peers: a message from any peer is fanned out to all other peers. There are no direct connections between non-host peers.

```
      Guest A
         |
Host ── Guest B
         |
      Guest C
```

Trade-off accepted: the host's browser does the relay work and is the single critical node. Mitigated by host-transfer (below).

## Module layout

The signaling server (`apps/backend`, `@release/server`) is **deleted**. All P2P logic lives in a new frontend module:

```
apps/frontend/src/network/
  types.ts      # all message types + payload shapes
  peer.ts       # PeerJS peer lifecycle (create, destroy, incoming-connection handler)
  lobby.ts      # room creation, join flow, role assignment, kick, host transfer
  session.ts    # in-game protocol: turn authority, attack windows, relay, state broadcast
```

**Dependency added to `apps/frontend`:** `peerjs`. No other new dependencies.

**Room code:** the host's PeerJS peer ID is the room identifier. UI shows the join link `https://<host>/?room=<peerId>` and a short code (`peerId.slice(0,6).toUpperCase()`, formatted `ABC-123`).

## Lobby & join flow

**Host creates a room:**
1. Host clicks "Create game" → `peer.ts` initializes a PeerJS `Peer` (PeerJS assigns the ID).
2. On `peer.open`, the peer ID becomes the room code. UI shows the join link + short code.
3. Host configures `maxPlayers` (2–6); changes broadcast as `LOBBY_CONFIG_UPDATED`.
4. Host waits in the lobby, listening for incoming DataChannel connections.

**Player joins:**
1. Guest navigates to the link (or enters the short code) → creates their own `Peer`, waits for `peer.open`.
2. Guest opens a DataChannel to the host peer ID → sends `JOIN_REQUEST { name }`.
3. Host compares current player count to `maxPlayers`, assigns a role, replies `PEER_LIST { peers, yourRole }` (peer list is display-only; guests do **not** connect to listed peers).
4. Host broadcasts `PEER_JOINED { id, name, role }` to all existing peers.
5. All lobby UI updates flow through the host relay over each peer's single connection.

**Lobby state:** every peer keeps a local `peers: Map<peerId, { name, role, ready }>`, rendered directly. No shared lobby object.

**Ready & start:**
1. Each player clicks "Ready" → `PLAYER_READY`. Guests don't block the start.
2. When all players are ready, the host's "Start game" button unlocks (host-only).
3. Host clicks "Start" → game-start flow.

**Kick (lobby or in-game):** host sends `PLAYER_KICKED { peerId, reason? }` to all → kicked peer sees a removal screen and disconnects; others drop them from state.

**Host transfer:**
1. Host sends `TRANSFER_HOST { newHostId }` to all peers.
2. All guests/players disconnect from the old host and reconnect to the new host peer ID (known from `PEER_LIST`).
3. New host accepts connections, resumes relay, and re-broadcasts the last `TURN_RESOLVED` snapshot so any peer mid-reconnect catches up.
4. Old host becomes a regular peer connecting to the new host.
5. New host confirms with `HOST_TRANSFERRED { from, to }`.

> If a deck/discard keeper is needed (see Open questions), host-transfer must also hand over that hidden state, not just the relay role.

## Game start

**Triggered by:** host pressing "Start game" after all players are ready.

1. Host builds the player list from peers with `role: 'player'` (host first, then join order).
2. Host generates a shuffled main deck + AI events deck using a seeded PRNG (`crypto.getRandomValues` for the seed, e.g. `mulberry32` for the deterministic shuffle), split per the rules.
3. Host deals starting hands: each player gets 1 Debugger + 4 random cards; AI and Error 503 cards are returned and redrawn if dealt (per the rules).
4. Host sends each player their private hand: `HAND_DEALT { cards }` — guests receive nothing here.
5. Host broadcasts `GAME_STARTED` to all (players + guests):

```typescript
GAME_STARTED {
  players: { id, name }[]   // seating order, players only
  guests: { id, name }[]    // spectators
  deckSize: number
  eventDeckSize: number
  releaseZones: {}          // empty at start
  currentTurn: playerId
  maxPlayers: number
  modes: GameModes
}
```

Guests render the board read-only from `GAME_STARTED` onward, receiving all subsequent public broadcasts but never private hand data.

## Turn protocol (Approach B, star topology)

The **current turn player** is mini-authority for their turn. All messages route through the host relay: non-host players send to the host; the host fans public events out to all peers and forwards targeted messages to the relevant peer. When the host is the turn player, it processes directly and skips self-relay.

**Normal turn flow:**
1. Turn player → `TURN_START { player, turnIndex }` → all.
2. Turn player may play any number of cards → each `CARD_PLAYED { card, target?, sudo?, codeReview? }` → all.
3. Turn player draws exactly one card → `CARD_DRAWN { deckSize }` → all (card identity stays private; see reveal-on-draw).
4. Turn player may play more cards.
5. Turn player → `TURN_END` → all → next player in seating order becomes turn player.

**Attack window (when a Release card is played):**
1. Turn player → `ATTACK_WINDOW_OPEN { releaseCard, releasePlayer, codeReview }` → all players.
2. Each non-turn **player** responds with `ATTACK { card, sudo? }` or `PASS`. Guests cannot respond.
3. Host collects responses; waits for all N−1 players or a 30s timeout (absent = `PASS`).
4. Turn player resolves attacks in **seating order** (deterministic):
   - For each attack → `DEFENSE_REQUEST { attack, fromPlayer }` → release player.
   - Release player → `DEFEND { card }` or `DECLINE`.
   - Turn player resolves the pair per the rules.
5. Turn player → `TURN_RESOLVED { state: GameState }` → all. Every peer replaces local state with this snapshot.

`TURN_RESOLVED` is the canonical checkpoint: it carries full public state (no private hands) and is the recovery point for guests and reconnecting peers.

**Code Review combo:** `codeReview: true` in `ATTACK_WINDOW_OPEN` signals the release is invulnerable to standard attacks (except DDoS); peers auto-`PASS` unless holding DDoS.

**Sudo:** encoded as `sudo: true` in the attack/card payload; resolution logic reads it.

## Rules-driven protocol extensions

Mechanics from [docs/rules-board-game.md](../../rules-board-game.md) beyond the basic turn flow:

**Reveal-on-draw** — AI and Error 503 must be revealed to all the moment they're drawn (they cannot stay private):
```
DRAW_REQUEST       {}                         // drawer → keeper
DRAW_RESULT        { card }                    // keeper → drawer (private)
AI_REVEALED        { aiCard, eventCard }       // → all; resolves the purple event-deck effect
ERROR503_DRAWN     { player }                  // → all; opens neutralize window
NEUTRALIZE         { method: 'debugger' | 'monitoring' | 'sacrifice', releaseCard? }
PLAYER_ELIMINATED  { player }                  // if Error 503 / Crush not neutralized
```

**Offensive attacks on a hand** (turn player's own turn — Bug/Out of Memory/Legacy Code take a random card; Security Bug requests a specific card):
```
HAND_ATTACK        { card, target, sudo?, requestedCard? }   // turn player → target via host
HAND_GIVE          { card }                                   // target → attacker (private)
HAND_ATTACK_RESULT { attacker, target, attackerHandSize, targetHandSize }  // → all; counts only, no card identity
```

**System Upgrade** (every other player discards one card):
```
DISCARD_REQUEST    { fromCard }     // → all other players
DISCARD_CHOICE     { card }          // each player → host
```

**Git operations** (deck/discard mutation — Branch/Merge/Rebase/Cherry-pick):
```
GIT_OP             { op: 'branch' | 'merge' | 'rebase' | 'cherry-pick', sudo? }
GIT_PEEK           { cards }          // keeper → player (private; rebase/cherry-pick)
GIT_REORDER        { order }          // player → keeper (secret)
```

**Other:** DDoS targets Monitoring / protected releases and freezes a returned Release for one round; Crush (AI event) destroys a Release and is neutralized like Error 503. These resolve through the standard attack/neutralize flow.

All hand/card transfers stay private through the host relay; public broadcasts carry only counts (`deckSize`, `handSize`), never hidden card identities.

## Message type summary

```
# Lobby
JOIN_REQUEST         { name }
PEER_LIST            { peers: { id, name }[], yourRole: 'player' | 'guest' }
PEER_JOINED          { id, name, role }
PLAYER_READY         {}
LOBBY_CONFIG_UPDATED { maxPlayers: 2 | 3 | 4 | 5 | 6 }
PLAYER_KICKED        { peerId, reason? }
TRANSFER_HOST        { newHostId }
HOST_TRANSFERRED     { from, to }

# Game start
HAND_DEALT           { cards: CardId[] }       # host → each player (private)
GAME_STARTED         { players, guests, deckSize, eventDeckSize, releaseZones, currentTurn, maxPlayers, modes }

# Turn
TURN_START           { player, turnIndex }
CARD_PLAYED          { card, target?, sudo?, codeReview? }
CARD_DRAWN           { deckSize }
TURN_END             {}
ATTACK_WINDOW_OPEN   { releaseCard, releasePlayer, codeReview }
ATTACK               { card, sudo? }
PASS                 {}
DEFENSE_REQUEST      { attack, fromPlayer }
DEFEND               { card }
DECLINE              {}
TURN_RESOLVED        { state: GameState }

# Rules-driven
DRAW_REQUEST         {}
DRAW_RESULT          { card }
AI_REVEALED          { aiCard, eventCard }
ERROR503_DRAWN       { player }
NEUTRALIZE           { method, releaseCard? }
PLAYER_ELIMINATED    { player }
HAND_ATTACK          { card, target, sudo?, requestedCard? }
HAND_GIVE            { card }
HAND_ATTACK_RESULT   { attacker, target, attackerHandSize, targetHandSize }
DISCARD_REQUEST      { fromCard }
DISCARD_CHOICE       { card }
GIT_OP               { op, sudo? }
GIT_PEEK             { cards }
GIT_REORDER          { order }
```

All messages share the envelope `{ type, payload, from, seq }`, serialized as JSON over the DataChannel.

## Open questions

- **Deck/discard keeper.** The hidden, ordered deck cannot be common knowledge (Git Rebase / Cherry-pick require secret reordering). Either the host holds it as hidden-state keeper (simple, fits the star topology, but the host sees the deck order) or a commit-reveal / encrypted-deck scheme keeps it trustless (more complex). To be resolved during implementation planning. The `DRAW_REQUEST`/`DRAW_RESULT` and `GIT_*` flows assume a keeper exists; host-transfer must hand over keeper state if the host is chosen.

## Out of scope (other specs)

- Game-rules engine (card resolution logic) — consumes this protocol, designed separately.
- Game screens / UI beyond the lobby connection flow.
- Reconnection beyond the `TURN_RESOLVED` checkpoint mechanism.
- Anti-cheat / state validation between peers.
