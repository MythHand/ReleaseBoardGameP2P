# Voice chat #217 — validation

## Branch and scope

Native execution in `.worktree/voice-chat-217`, branch `feat/217-voice-chat`.
Integration baseline `cf491d170ffd34cfc4f016cd1760e8b211c6cd20`: main with merged UI #210 plus spectator PR #214 head `e6da26e3bf1fde265f0abd49e49fa769cbc2999b`.
Product head `eb9a67068c790eb5a2047aa59427898b46917793`.
GitHub #214 is still OPEN at the same SHA (checked 2026-09-30). No PR was merged, closed or modified. Publication to main must first resolve this dependency; voice review uses the integration baseline to exclude the spectator implementation from its scope.

## Automated checks

- Baseline frozen install, typecheck, lint and build passed. Server tests initially hit sandbox `listen EPERM`; full rerun with local network permission passed.
- Task 1 permissions: RED missing implementations; GREEN 12 targeted; full 2325.
- Task 2 clipboard callbacks: RED missing adapter/failing feedback; GREEN 44 targeted; full 2331.
- Task 3 media transport: RED contract failures; GREEN 16 targeted; full 2338.
- Task 4 wire protocol and authority: RED missing implementation; GREEN 4 targeted; full 2342.
- Task 5 Web Audio: RED missing graph and state observation; GREEN 5 targeted; full 2347.
- Task 6 calls/runtime/retry: GREEN 40 voice/transport tests, full 2367. Tests cover simultaneous listeners, delayed permission grants, microphone denial/missing device, capture timeout, metadata/session validation, ICE grace, bounded retries, stale callbacks, sender replacement and transport error isolation.
- Task 7 room lifecycle: initial RED six missing-facade failures; GREEN eight voice lifecycle tests plus existing room/bot/spectator/provider tests, 203 targeted; full 2375. StrictMode replay, capture-before-transport cleanup, route/rematch continuity, readmission, refusal, kick and reload are covered.
- Task 8 feature/UI: initial RED missing adapter/translations and absent Board voice rail; GREEN 70 targeted route/model tests and 16 UI VoiceChat tests.
- Admission ordering regression: host snapshot arriving before PEER_LIST/CHAT_HISTORY produced `connecting` instead of `connected` (RED). Ignoring pre-admission snapshots made the test GREEN; 36 voice/lifecycle tests passed.
- Chrome decoder regression: direct Web Audio received silent remote tracks despite RTP. A controlled same-page RTC connection reproduced it; starting a muted HTML audio element changed decoded peak from 0 to 0.0303. Two ownership/refusal tests failed RED and passed GREEN after adding one owned muted decoder per remote stream. Full suite then passed 2386.
- Final full suite: **2386/2386** (server 6, engine 487, UI 247, playground 3, frontend 1643). Workspace `pnpm typecheck`, `pnpm lint`, `pnpm build` and `git diff --check` passed, sequentially with no concurrent build during tests.
- `reuse` executable is unavailable locally. CI has the REUSE job using `fsfe/reuse-action@v5` and `REUSE.toml`; an unpublished branch has no CI result to claim.
- Existing warnings: react-babel/esbuild deprecations, jsdom canvas unavailable, build bundle over 500 kB. Worktree install prepare reports ENOTDIR for `.git` file; common-repository pre-commit hook remains active and all commits run lint-staged/typecheck.

## Browser evidence

Local frontend `http://127.0.0.1:5187/`, PeerServer `127.0.0.1:9007`, playground `http://127.0.0.1:5180/playground/`. Synthetic microphone devices only; no physical microphone was requested by this validation.

- `/debug.html`: player and spectator, off/connecting/connected/interrupted at 1280×720 and 1920×1080. Voice after settings/before chat, 420 px drawer, micOff icon, local mute, 200% and 14 participants. Sixteen screenshots in local `output/playwright/debug-{player|spectator}-{state}-{width}.png`.
- At 1280×720 the actual OverlayScrollbars viewport measures 428 px against 504 px content and scrollTop advances to 76. At 1920×1080 the list fits at 504 px. The master slider stays above the scroll. Chat/settings coexistence checked.
- Compared named LobbyChatStory, TableChatStory and StatsChatStory at both sizes: `/playground/{lobby-chat|table-chat|stats-chat}`; local screenshots `output/playwright/story-*.png`. Existing approved UI is reused; runtime is not initialized in debug/playground.
- Chrome: six players plus two spectators in eight isolated contexts. First two enter as listeners under synthetic NotAllowedError, then explicitly enable microphones. Every participant establishes seven media connections, all `connected`, with positive inbound RTP bytes/packets and decoded sample counts on every pair. Participant count reaches eight on all screens. Capture remains one stream per participant; every captured track is `ended`, every media connection is closed and every AudioContext is closed after explicit voice exit. Raw evidence: `output/playwright/network-results.txt`; screenshot `network-eight-lobby.png`.
- Existing Popover intentionally consumes the first outside pointer press to close; browser exit tests close the popover with Escape before pressing headphones. This preserves #210 behavior.
- Chrome three-member room uses 440 Hz oscillators injected only at capture, preserving the production permission/runtime path. All six directions show decoded peaks about 0.0300–0.0303 and positive decoded sample counts. Raw evidence `tone-results.txt`; packet reception alone was insufficient, so decoded waveforms were measured through temporary analysers.
- Chrome three-member room (host/player/spectator) enters a real match, navigates client-side to the results route, and returns using the results button. Voice count and microphone ownership survive every screen change. Results navigation is programmatic during an unfinished match; this does not claim a completed game-over flow. Local screenshots `network-tone-{board|stats|lobby}.png` and raw evidence `tone-results.txt`.
- Firefox 156/Playwright 1553 installed successfully, but browser launch exits with `Could not find profile folder` before page navigation. Both an automatically generated profile and explicit existing `/private/tmp/voice-firefox-217` fail. Firefox media/ICE and Chrome↔Firefox interoperability therefore remain unverified; no VPN, DNS or TURN settings were changed.

## Limits and remaining manual acceptance

Physical speech audibility, echo behavior and cross-device/NAT connectivity need a live browser test. RTP reception alone does not establish audible speech ([WebRTC statistics definitions](https://www.w3.org/TR/webrtc-stats/)). Mic refusal here uses an injected NotAllowedError; native browser permission prompts are covered by the adapter contract, not a human-operated prompt. Host kick stops the spectator capture, removes it from retained voice rosters, and closes its decoders. Player reload restores the room with zero capture requests; manual voice rejoin works. Real-browser single-call failure recovery and rematch remain pending manual checks; their lifecycle paths are covered by deterministic tests. Real host migration is absent in the existing game and is not implemented or claimed here.

## Rulings

1. Clipboard success uses `undefined` instead of `void`; object contracts use interfaces because repository lint requires these equivalent forms. No runtime cost; if wrong, a type-only correction is needed.
2. VoiceAudio adds `subscribeState(listener): unsubscribe` to observe browser output suspension without leaking AudioContext across the boundary. Cost: one additional tested event interface.
3. Pending data dials track the owning DataConnection so an old callback cannot clear a newer dial and misclassify its failure as audio-only. Cost: a transport bookkeeping change; RED→GREEN regression preserves game error behavior.
4. Host roster confirmation uses the existing 15000 ms setup deadline to avoid forever-connecting with an incompatible host. Cost: very slow admission can show interrupted/callFailed until a late valid roster arrives or the user rejoins.

5. Each remote stream owns one muted HTML audio decoder because Chromium does not start remote decoding from MediaStreamAudioSourceNode alone. Audible output remains exclusively in the gain graph. Cost: one extra media element per remote participant, with explicit pause/srcObject cleanup and playback-refusal reporting.
