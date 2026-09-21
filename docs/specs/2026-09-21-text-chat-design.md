# Room text chat — Design

**Date:** 2026-09-21
**Project:** ReleaseBoardGameP2P ("Release любой ценой")
**Scope:** A host-authoritative text chat shared by the lobby, game table, and
results screen. Closes [#90](https://github.com/MythHand/ReleaseBoardGameP2P/issues/90).

## Goal

Players and spectators in one room can exchange text without leaving the game.
The conversation follows the room across `Lobby -> Table -> Stats`, survives a
host or guest reload, and is delivered in full to a participant who joins or
reconnects later.

The visual contract already exists in the playground:

- `Lobby + chat`: a third column beside the lobby content
- `Table + chat`: a chat tab, a right-side drawer, notifications, and a local
  notification preference
- `Stats + chat`: a persistent right-side chat column while results scroll

This work connects those designs to the real P2P session. It does not redesign
the chat UI.

## Context

`@release/ui` already provides `Chat`, the role-coloured `Message` primitive,
chat slots on the shared lobby, table, and stats screens, and the table's chat
drawer and toast placement. The playground stories exercise the intended layout
and interaction states with local mock messages.

The frontend does not yet provide chat state or a chat protocol. Its live lobby
is a custom screen, the board is a maintained fork of the shared table screen,
and stats renders the shared screen without its chat slot. The common session
boundary is `SessionProvider`/`useLobby`, which already survives navigation among
all three routes and owns the room's host-routed transport.

Earlier exploration in [PR #118](https://github.com/MythHand/ReleaseBoardGameP2P/pull/118)
and [PR #122](https://github.com/MythHand/ReleaseBoardGameP2P/pull/122)
established two boundaries retained here:

- chat is one feature across lobby, table, and results, with its own protocol
  and history
- voice chat is not part of this feature; it would require a materially
  different media topology

The reconnect work already persists room and keeper records in per-tab
`sessionStorage` for 12 hours. Chat follows that same room lifecycle.

## Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Authority | The room host owns the canonical append-only chat journal |
| 2 | Submission | A guest sends text intent only; the host assigns author, id, order, and time |
| 3 | History | Every join and reconnect receives the full room history |
| 4 | Retention | No message-count limit; the journal lives until the room is cleared or its existing 12-hour restore TTL expires |
| 5 | Message size | Non-empty plain text, at most 2,000 Unicode code points after trimming |
| 6 | Identity | A host-minted public room `memberId`, separate from reconnect credentials and transient peer ids |
| 7 | System entries | Store semantic events and localize them at render time; never put localized sentences on the wire |
| 8 | UI | Reproduce the three approved playground stories in the real frontend |
| 9 | Table notifications | Remote human messages only, while the drawer is closed and the local preference is enabled |
| 10 | Voice | Explicitly out of scope |

## Domain model

Chat is independent of the engine event log. Engine events are private
projections with visibility rules and exist only after a match starts; chat is
room-wide, includes spectators, and begins in the lobby.

```ts
type MemberId = string

type ChatRole = 'host' | 'player' | 'spectator'

interface ChatAuthor {
  memberId: MemberId
  name: string
  role: ChatRole
}

interface UserChatEntry {
  kind: 'message'
  id: string
  sequence: number
  createdAt: number
  author: ChatAuthor
  text: string
}

type ChatSystemEvent =
  | { kind: 'memberJoined'; memberId: MemberId; name: string }
  | { kind: 'memberLeft'; memberId: MemberId; name: string }
  | { kind: 'memberReconnected'; memberId: MemberId; name: string }
  | { kind: 'memberKicked'; memberId: MemberId; name: string }
  | { kind: 'roleChanged'; memberId: MemberId; name: string; role: ChatRole }
  | { kind: 'modeChanged'; setting: string; value: string }

interface SystemChatEntry {
  kind: 'system'
  id: string
  sequence: number
  createdAt: number
  event: ChatSystemEvent
}

type ChatEntry = UserChatEntry | SystemChatEntry
```

`sequence` is the canonical total order and is monotonically increased by the
host. `id` is stable for idempotent merging and React identity. Both are stored
with the journal so a restored host never reuses either value.

The author snapshot preserves a departed participant's name and last-known role.
At render time, an active roster member's current name and role override the
snapshot for all their messages; this implements the playground rule that a role
change recolours the author's whole side of the conversation. If the member is no
longer in the roster, the snapshot remains and the author is marked `gone`.

`memberId` is public correlation identity, not proof of ownership. The host mints
it on first admission, remembers its association with the private reconnect
identity, includes it in the public roster, and returns the same value on a valid
reconnect. Protocol authorization never trusts a claimed `memberId`; it resolves
the sender from the live connection.

## Wire protocol

Three new messages are sufficient:

```ts
| { type: 'CHAT_SEND'; payload: { text: string } }
| {
    type: 'CHAT_HISTORY'
    payload: { entries: ChatEntry[]; selfMemberId: MemberId }
  }
| { type: 'CHAT_ENTRY'; payload: { entry: ChatEntry } }
```

### Sending

1. A guest sends `CHAT_SEND` to the host. It carries no author, role, timestamp,
   id, or sequence.
2. The host resolves the connection to a current room member, trims and validates
   the text, creates one canonical entry, appends it, persists the journal, and
   broadcasts `CHAT_ENTRY`.
3. A host's local send enters the same append function. It is not inserted
   optimistically through a second path.
4. Every participant, including the sender, displays the canonical broadcast.

`CHAT_SEND` is never relayable. A guest cannot cause another guest to accept a
peer-authored canonical entry. On guests, `CHAT_HISTORY` and `CHAT_ENTRY` are
accepted only when the envelope sender is the current host; the host rejects
peer-originated canonical chat messages.

### Joining and reconnecting

After accepting a join, the host sends `CHAT_HISTORY` on that connection before
later live chat broadcasts. DataChannel ordering normally preserves this order,
but correctness does not depend on timing: the receiver upserts by `id`, sorts by
`sequence`, and therefore handles a repeated snapshot or an overlapping live
entry without duplication.

The history response also tells the receiver its public `selfMemberId`, so its
own messages remain visually self-authored after a reload even though its PeerJS
id changed. A fresh late join receives every retained entry, not only entries
created after it joined.

Applying `CHAT_HISTORY` is a synchronization operation, not a stream of new-message
events. It never creates table notifications. Only a newly accepted live
`CHAT_ENTRY` can do so.

## Host journal and persistence

The host owns a small pure chat-journal module. It validates, appends, restores,
and serializes entries without React or transport dependencies, so the same rules
are directly unit-testable.

Persistence adds a `release:chat` record beside the current session, keeper, and
event-log records:

```ts
interface StoredChat {
  roomCode: string
  entries: ChatEntry[]
  nextSequence: number
  members: Array<{ clientId: string; memberId: MemberId }>
  savedAt: number
}
```

The record uses the existing storage wrapper and `RESTORE_TTL_MS`. It is read only
when `roomCode` matches the session being restored. Invalid, corrupt, expired, or
wrong-room data is discarded. The host clears the canonical record only when it
explicitly disbands/leaves the room or the room expires. A guest who leaves or is
kicked clears its own in-memory chat with the rest of its local session, but that
does not truncate the host's canonical journal for the participants who remain.
Navigation between lobby, board, and stats clears neither copy.

There is deliberately no truncation by count or byte budget. The complete
journal is retained for the room lifecycle. Browsers that reject storage writes
continue in memory, following the existing persistence fallback; chat remains
usable in that tab, although no web application can promise reload recovery when
the browser refuses storage.

## System entries

System entries use the same append, sequence, persistence, history, and broadcast
path as user messages. They are emitted for room facts the host already commits:

- first join
- leave/disconnect
- successful reconnect
- kick
- role change
- host game-mode/configuration change represented by the approved chat copy

A reconnect is not rendered as a second first join. The existing membership and
reconnect decision determines which semantic event is appended. Transient network
attempt details stay in the reconnect UI and do not pollute room history.

For a first join or reconnect, the host admits the member and appends the matching
system entry before creating that connection's history snapshot. The joining peer
therefore receives the event inside `CHAT_HISTORY`; already connected peers receive
the same entry live through `CHAT_ENTRY`. One canonical entry exists in both cases,
and an overlapping delivery remains harmless because merging is idempotent.

The wire stores semantic data only. A mode change carries the configuration
axis (`setting`) and selected option (`value`) as catalog keys, never rendered
labels. The frontend adapter maps every event through `@release/translation`,
so changing language immediately rerenders the full history in that language.

## Frontend ownership

`SessionProvider` exposes one room-level chat model sourced from `useLobby`:

```ts
interface RoomChat {
  entries: ChatEntry[]
  selfMemberId: MemberId | null
  send(text: string): void
}
```

That state stays mounted during route changes and is the single source for all
three screens. A small frontend adapter combines entries with the current roster,
localizes system events and times, and maps them to `@release/ui`'s `ChatMessage`.

The UI kit's current self detection compares display names. It changes to accept
a stable self/member identity on messages, because display names are presentation
and may collide. Grouping consecutive messages uses the same stable author id.

Draft text remains local to the mounted `Chat` component and is not part of the
room journal. Navigating to another screen may discard an unsent draft; sent
messages and history never disappear.

## Screen integration

### Lobby

The real `LobbyView` reproduces the `Lobby + chat` playground composition: the
existing lobby content plus the 320px chat column at the right breakpoint. It
uses existing UI tokens, typography, and translated chat copy. The shared
playground screen is a visual reference, not a frontend dependency.

### Table

The frontend's maintained board fork gains the shared table behavior already
demonstrated by `Table + chat`:

- `'chat'` joins the panel union
- the bottom rail includes the translated chat tab
- the drawer renders the room `Chat`
- settings include the local `Chat notifications` preference
- the toast slot renders incoming remote user messages

The notification preference defaults to enabled and is local display state; it
does not travel on the wire or affect journal retention.

Notification rules match the approved story:

- remote live user messages only
- none for the sender's own messages
- none for system entries
- none while the chat drawer is open
- none while the preference is disabled
- none for history/reconnect synchronization
- at most four visible
- six-second lifetime
- hover pauses expiration
- a fifth notification evicts the oldest
- selecting a notification opens the chat drawer

### Stats

The real stats page passes the same room chat into the shared `Stats` chat slot,
matching `Stats + chat`. Results retain their independent scroll area while chat
occupies the persistent right column.

## Plain-text and validation rules

- Trim leading and trailing whitespace before validation and storage.
- Reject an empty result.
- Count Unicode code points, not UTF-16 code units, against the 2,000-character
  maximum.
- Preserve internal newlines.
- Render as text; do not parse HTML, Markdown, links, or mentions.
- Enter sends; Shift+Enter inserts a newline, as the existing `Chat` already does.
- Disable or safely ignore sends while there is no authoritative host connection.

The composer clears only when submission is accepted locally for transport. A
host rejection or disconnected send must not fabricate a local history entry.

## Scrolling behavior

The existing `Chat` behavior remains the contract:

- open initially at the latest message
- follow incoming entries only while the reader was already near the bottom
- never pull a reader away from older history they intentionally scrolled to

History synchronization is applied in one state update so restoring a large
journal does not animate or toast each entry independently.

## Failure and abuse boundaries

The host is the trust boundary:

- author, role, member identity, timestamp, id, and order come from host state
- a sender must be an admitted live room member
- malformed and overlong payloads are ignored without mutating the journal
- canonical guest-forged history or entry packets are ignored
- duplicate canonical entries merge idempotently
- malformed persisted records are discarded rather than partially trusted

Rate limiting, moderation, reporting, muting, and content filtering are separate
product features and are not added here. The 2,000-code-point bound limits a
single protocol frame; there is intentionally no room message-count limit.

## Testing

### Unit tests

- append assigns monotonic sequence/id/time and resolves the author from host
  state
- empty and overlong text is rejected; internal newlines and Unicode are kept
- history merge is ordered and idempotent
- role/gone rendering uses active roster data with snapshot fallback
- semantic system events localize in both supported languages
- stored history restores only for the matching unexpired room
- corrupt, wrong-room, and expired records are removed
- clearing a room clears its chat; route navigation does not

### Network/session tests

- guest send reaches the host and returns as one canonical entry to every peer
- host send uses the same journal path
- a guest cannot spoof author, role, time, id, or sequence
- peer-authored `CHAT_ENTRY`/`CHAT_HISTORY` is rejected
- late join receives the complete existing history, then live entries
- guest reconnect keeps `memberId`, self styling, and history without duplicates
- host reload restores entries, member mappings, and the next sequence
- history synchronization produces no notifications
- message count grows beyond fixture-sized lists without truncation

### Component and browser tests

- lobby, board, and stats render the same journal through their approved layouts
- Enter/Shift+Enter, plain-text rendering, grouping, role changes, and gone styling
- board drawer and all notification rules, including four-item eviction and hover
  pause
- two real browser tabs exchange messages before, during, and after a match
- reload the guest and host independently and confirm full history continuity

Focused typechecking, affected Vitest suites, the frontend build, and a real
browser pass are required before completion is claimed.

## Out of scope

- voice or video
- direct/private messages
- attachments and rich previews
- Markdown, reactions, mentions, and typing indicators
- editing or deleting entries
- moderation, rate limiting, muting, and reporting
- server-side or cross-room archival after the room expires
- retaining unsent drafts across route changes

## Acceptance criteria

1. A host, player, or spectator can send and receive plain-text messages in one
   room from lobby, table, and results.
2. All three real screens match their named playground chat designs.
3. The complete room history follows navigation and is sent to late joiners and
   reconnecting participants.
4. A host reload restores the complete journal and continues sequence ordering;
   a guest reload restores the same public member identity and self styling.
5. No count-based history truncation occurs during the room's 12-hour lifecycle.
6. Author metadata cannot be supplied or spoofed by a guest.
7. System entries are semantic on the wire and localized at render time.
8. Departed authors remain visible and dimmed; active role changes recolour their
   existing messages.
9. Table notifications follow the approved visibility, capacity, lifetime,
   pause, and preference rules and never replay restored history.
10. Voice chat and the other explicitly listed non-goals are not implemented.
