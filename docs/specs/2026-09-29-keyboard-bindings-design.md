# Shared keyboard bindings — Design

**Date:** 2026-09-29  
**Issue:** [#119](https://github.com/MythHand/ReleaseBoardGameP2P/issues/119)  
**Branch:** `feat/119-keyboard-bindings`  
**Starting point:** `main` at `47a41b85`  
**Status:** Written specification approved by the user on 2026-09-29.

## Intent and success criteria

Players should be able to predict what a key will do from the interface in front
of them. An Escape press must act on one active layer, instead of closing a
dialog and cancelling the game gesture underneath it. In the lobby, Space must
start/restart the canvas mini-game and trigger a jump without first focusing it.
Typing in chat and activating ordinary controls must keep their existing meaning.

Success means one window-level keyboard listener, explicit ownership and
priority for global bindings, migration of the existing global handlers, and
regression coverage of conflicting layers and actual Space-driven runner behavior.
Local element activation and navigation remain local.

## Current code

At the starting commit, global `keydown` listeners exist in:

| Consumer | Keys and current responsibility |
|---|---|
| `primitives/Modal` | Capture-phase Escape dismissal and Tab focus cycle |
| `blocks/VideoPlayer` | Escape closes the expanded video |
| `table/Table` | Escape cancels target selection |
| Frontend `_Board` | Three listeners: skip opening, cancel staged play, cancel staged defence |
| `blocks/BugRunner` | ArrowUp starts/jumps globally; Space works only with runner focus |
| Playground `CardParallaxStory` | ArrowUp/ArrowDown change the displayed card |

Modal currently captures the event before its dialog's local propagation guard.
That ordering, Escape with focus outside the dialog, and its Safari-friendly
manual Tab cycle must survive migration. Drawer is a controlled visual surface;
Table and Board already own its open state and closing action.

## Chosen architecture

Use a small registry in `apps/ui/src/keyboard`, with a React hook exported from
`@release/ui`. Kit components import its leaf entry; frontend and playground
consumers use the kit export. No new dependency or required root provider is added.

A provider-based registry was considered: it gives explicitly isolated React
trees, but requires every application root and standalone component example to
install the same provider. A registry owned by the browser window fits the
current standalone kit consumers and ensures they arbitrate the same events.

The module has two responsibilities with a narrow boundary:

- `registry.ts`: registration, activation ordering, key arbitration, focus
  filtering and one native capture listener per window. It has no React or game
  dependencies and does not access browser globals at module import time.
- `useKeyboardLayer.ts`: stable registration identity, current callbacks and
  options, and cleanup as a consumer activates, updates or unmounts. It exposes
  the layer's stack position/topmost state when Modal needs it for focus/stacking.

The listener attaches when the first layer becomes active and detaches after the
last layer leaves. Different browser windows have separate registries. React
StrictMode setup/cleanup must not duplicate listeners, leave registrations behind,
or promote an existing layer merely because its callbacks changed.

## Registration contract

`useKeyboardLayer` describes a named layer with:

- a stable instance identity and diagnostic name;
- `active`, an explicit numeric priority using shared named constants;
- its bindings: key, current handler, enabled condition, modifier policy,
  focus policy and repeat policy;
- an optional lower-layer barrier and root element for an overlay;
- for consumers that need them, the derived order among peers and topmost state.

Bindings match `KeyboardEvent.key`; Space is the literal space character. There
are no configurable user shortcuts or multi-key sequences in this change.

Handlers return `handled` or `pass`. `handled` stops registry dispatch, prevents
the browser default and stops DOM propagation for that event. `pass` explicitly
allows the next eligible binding to try the same event. Inactive/disabled
bindings are not candidates. Callback return values do not encode game legality;
existing game methods retain their own guards.

Named priorities are `screen`, `panel` and `modal`, in increasing order. Within
one priority, the most recently activated layer comes first. An ordinary render,
callback update or panel-content change does not count as opening a new layer.
Bindings within a layer have explicit order; consumers should use one decision
handler when several actions compete for the same key.

Dispatch considers a snapshot of the eligible layers: opening or closing a layer
inside a handler does not redispatch the same event to the new interface.
A read-only registry inspection function exposes names, keys, priorities,
activation order and barriers for tests/debugging; it does not expose callbacks
or retain event/input contents. No debug screen is added.

## Event and focus rules

1. Ignore events already prevented, composition events, and the legacy IME
   composition sentinel. Ignore modifier combinations unless that binding
   explicitly supports them; this preserves browser/system shortcuts.
2. Visit active layers from highest priority to lowest, with stable activation
   order breaking ties. Apply each binding's key, enabled and focus policies.
3. Run the first eligible binding. Stop on `handled`; continue only on `pass`.
4. A modal barrier blocks lower global bindings even when the modal has no
   command for that key. Modal's own handlers do not opt into passing below it.

Screen shortcuts skip text entry and other interactive targets by default.
This includes input, textarea, select, editable descendants, buttons, links,
summary, focusable elements and corresponding interactive ARIA roles. Inspect
the event path as well as ancestors so editable descendants and shadow hosts do
not accidentally activate screen commands. Escape cancellation/dismissal and
Modal's Tab cycle explicitly opt into running while a control has focus.

Because the registry runs in capture, it cannot rely on a later local handler's
`preventDefault`. These focus policies protect local Card, Seat, ReleaseZone,
Menu, Start and Chat handlers before they run. They are not migrated or replaced.
An ignored/unbound event keeps its native/default and local React behavior.

A barrier is distinct from preventing a DOM event. Space inside a modal's input
or button is left to that element while the background runner is blocked. If
focus has escaped outside the modal, suppress both propagation and default for
a blocked registered shortcut so a background runner button cannot activate via
its local handler or native click. Escape and Tab still belong to the modal.

Repeat is disabled by default: a repeated matching key is consumed without
running the action or falling through. Tab explicitly allows repeats; the
runner's existing ArrowUp repeat behavior is retained explicitly. Holding Space
cannot create repeated jumps/restarts; holding Escape cannot close several
layers in succession. Unbound text/native keys retain their repeat behavior.

## Modal lifecycle and stacking

Modal owns a barrier while its overlay is mounted, including its existing exit
transition. Escape invokes `onClose` only while `open` is true; during exit it
still consumes Escape without another callback or a background cancellation.

Only the top modal moves/traps focus. Preserve forward/backward Tab cycling,
including focus outside the dialog; if no focusable child exists, keep focus on
the dialog itself. Restore focus after the exit transition only to a connected
element permitted by the remaining top modal. Otherwise focus that modal's
first focusable element (or the dialog). Closing a lower modal must not steal
focus from a higher one.

Modal uses the registry's compact peer stack rank with the existing modal
z-index token, so visual stacking and keyboard precedence agree when multiple
modals are open. This rank is not the lifetime activation counter and does not
grow after repeated open/close cycles. Existing visuals and animation timings
remain unchanged.

## Consumer migration

Migrate Modal first: its capture behavior, focus cycle and nested-layer tests
prove the registry contract. Then migrate the other consumers without changing
their action implementations.

| Consumer | Registration and behavior |
|---|---|
| Modal | Modal priority; Escape, Tab and lower-layer barrier |
| VideoPlayer | Panel priority; Escape closes the expanded video |
| Table drawer owner | Panel priority while open; Escape closes through the existing controlled/uncontrolled state path |
| Board drawer owner | Same contract as Table; Drawer itself stays a visual primitive |
| Table target selection | Screen priority; Escape cancels the active selection |
| Board | One screen Escape decision: cancellable defence, then cancellable staged play/cost, then opening skip; invoke at most one existing action |
| BugRunner | Screen priority global Space/ArrowUp when enabled by the lobby; focused activation remains local |
| CardParallaxStory | Screen priority ArrowUp/ArrowDown; retain navigation on its own card rail, respect editable/other local controls |

An open drawer handles Escape before a selection on the table. A later press
can cancel the selection. Closed/prebuilt drawer content cannot register an
active layer solely because it remains mounted.

Board's existing cancellability/dispatched/animation guards remain authoritative.
A press selecting cancellation must not also skip opening even if the existing
cancel method declines during an in-flight animation. No engine, networking,
card rules, staging persistence or card-flight behavior is changed here.

## Lobby runner

Add an explicit `globalKeys` opt-in on BugRunner, enabled at both lobby mounts:
`apps/ui/src/screens/Lobby` and frontend `pages/lobby/_LobbyView`. Standalone
examples keep focused controls, so two runners shown together do not compete
for a page-level binding.

Global Space and ArrowUp call the same existing game action as pointer input.
Space starts an idle game, jumps during a run, and restarts after a crash when
the game's existing restart guard permits it. Prevent page scrolling for an
accepted Space. Ignore modified/composing Space and repeated Space presses.

The focused runner keeps Space, ArrowUp and Enter activation; its Space path
also ignores repeat. Focus filtering ensures one physical key reaches either
the global binding or the focused control, never both. Pointer behavior and
the game simulation are unchanged. Update both locale labels to advertise the
available controls without adding implementation details to player-facing copy.

## Verification

Write behavior tests before each implementation slice. Prove:

- One listener for multiple consumers; stable activation order across rerenders,
  correct cleanup and no duplicate dispatch under StrictMode.
- Priority, explicit pass, disabled bindings, safe dispatch when handlers alter
  registrations, modifier/composition filtering and repeat handling.
- Text/editable/interactive targets preserve local handling; Escape's explicit
  focus opt-in works; modal barriers block lower shortcuts without blocking
  normal input or button activation inside the dialog.
- Modal Escape with focus inside/outside, Tab and Shift+Tab wrapping, no-child
  focus fallback, stacked/reopened modals, exit-transition blocking and correct
  focus restoration. One Escape closes only the top modal.
- Drawer Escape closes the panel while preserving underlying selection; the
  next press cancels it. Cover both controlled and uncontrolled panel state.
- Board cancellation wins over opening skip when both are eligible; staged
  defence and existing dispatched/in-flight guards remain correct.
- Real runner state/render changes after global Space: start, actual jump,
  restart and no repeat after holding. Cover focused dispatch exactly once,
  no page scroll, editable descendants, chat, buttons, composition/modifiers,
  an open modal and two standalone previews. Do not settle for a callback-only
  test that never observes the game.
- Chat Enter/Shift+Enter, local Card/Seat/Menu activation, video dismissal and
  card-preview navigation retain their intended behavior.

Run relevant component/Board regressions during development, then full `pnpm test`,
`pnpm lint`, `pnpm typecheck` and `pnpm build` on Node 24. Check that consumers no
longer install their own global key listeners. Browser verification uses the
local lobby/chat/modal and Board/debug flows, including Space without prior
canvas focus. Report local results separately from any deployed verification.

## Scope boundaries and delivery

This work implements #119 and lobby Space coverage from `main` in its own
issue-numbered branch. Keep local element activation, game rules and unrelated
animation/networking fixes out of the change. No shortcut preferences UI,
command palette, external hotkey dependency or general focus-management rewrite.

After written-spec approval, prepare an implementation plan and have the user
review it and choose the execution method. Only then begin product changes.
The completed change will be published as a new draft PR targeting `main`.
