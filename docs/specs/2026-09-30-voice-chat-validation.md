# Voice chat #217 — validation

## Branch and scope

Native execution in `.worktree/voice-chat-217`, branch `feat/217-voice-chat`.
Integration baseline `cf491d170ffd34cfc4f016cd1760e8b211c6cd20`: main with merged UI #210 plus spectator PR #214 head `e6da26e3bf1fde265f0abd49e49fa769cbc2999b`.
Product head `99663b9177e92262089bfebeaa6015e676dbd11e`.
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
- Final review regression: two tests failed RED with ready member IDs preserved after DTLS failure while ICE remained connected. Media-port now observes terminal `connectionstatechange` and removes its listener on retirement. Tests cover caller retry, receiver accepting retry, stale callbacks, and terminal failed/closed states; focused GREEN 57/57 followed by the full suite including the extra closed-state case.
- Final full suite: **2389/2389** (server 6, engine 487, UI 247, playground 3, frontend 1646). Workspace `pnpm typecheck`, `pnpm lint`, `pnpm build` and `git diff --check` passed, sequentially with no concurrent build during tests.
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
- Chrome rematch: after the first results→lobby round trip, host and player ready again and start game 2; spectator follows. All three retain exactly one live capture, voice count remains three, and decoded peaks remain about 0.03 on all six directions after the second results→lobby round trip. Kick, reload/manual voice rejoin, and complete resource cleanup pass in the same run. Raw evidence `output/playwright/tone-rematch-results.txt`.
- Firefox 156/Playwright 1553 installed successfully, but browser launch exits with `Could not find profile folder` before page navigation. Both an automatically generated profile and explicit existing `/private/tmp/voice-firefox-217` fail. Firefox media/ICE and Chrome↔Firefox interoperability therefore remain unverified; no VPN, DNS or TURN settings were changed.

## Limits and remaining manual acceptance

Physical speech audibility, echo behavior and cross-device/NAT connectivity need a live browser test. RTP reception alone does not establish audible speech ([WebRTC statistics definitions](https://www.w3.org/TR/webrtc-stats/)). Mic refusal here uses an injected NotAllowedError; native browser permission prompts are covered by the adapter contract, not a human-operated prompt. Host kick stops the spectator capture, removes it from retained voice rosters, and closes its decoders. Player reload restores the room with zero capture requests; manual voice rejoin works. Real-browser single-call failure recovery remains pending manual acceptance; deterministic transport/call tests cover both endpoints and terminal DTLS states. Rematch has now passed in Chrome with synthetic sound. Real host migration is absent in the existing game and is not implemented or claimed here.

## Independent review

One fresh `gpt-6-astra` reviewer inspected the whole voice diff `cf491d17..df5fa118`, including all five implementation rulings, and independently ran 73/73 focused tests. Critical: none; Important: one P2 terminal DTLS recovery gap; Minor: none. The reviewer proved the gap through production code, installed PeerJS 1.5.5 and the [WebRTC connection-state definition](https://www.w3.org/TR/webrtc/#dom-rtcpeerconnectionstate); no real-browser DTLS failure was claimed.

Author re-grading retained P2: a failed media connection must stop claiming readiness and allow a retry. One fix pass produced `99663b91`, RED→GREEN regressions and full 2389/2389 plus typecheck/lint/build. No second independent review was dispatched, as required by Native execution. No review findings remain unresolved; no deferred minors.

The review set aside real host migration, spectator implementation #214 and a 34-person mesh. Each was re-graded explicitly below, rather than treating scope exclusions as evidence of correctness.

## Rulings

1. Clipboard success uses `undefined` instead of `void`; object contracts use interfaces because repository lint requires these equivalent forms. No runtime cost; if wrong, a type-only correction is needed.
2. VoiceAudio adds `subscribeState(listener): unsubscribe` to observe browser output suspension without leaking AudioContext across the boundary. Cost: one additional tested event interface.
3. Pending data dials track the owning DataConnection so an old callback cannot clear a newer dial and misclassify its failure as audio-only. Cost: a transport bookkeeping change; RED→GREEN regression preserves game error behavior.
4. Host roster confirmation uses the existing 15000 ms setup deadline to avoid forever-connecting with an incompatible host. Cost: very slow admission can show interrupted/callFailed until a late valid roster arrives or the user rejoins.

5. Each remote stream owns one muted HTML audio decoder because Chromium does not start remote decoding from MediaStreamAudioSourceNode alone. Audible output remains exclusively in the gain graph. Cost: one extra media element per remote participant, with explicit pause/srcObject cleanup and playback-refusal reporting.

6. Real host migration stays outside this change: the existing game cannot migrate a live host and voice follows the room lifecycle. Cost if wrong: host departure can end room voice instead of migrating it.
7. Spectator #214 stays outside the voice-diff review, as the explicit integration dependency; it is still OPEN and this work does not imply merging it into main. Cost if wrong: upstream spectator changes require integration revalidation before landing.
8. A 34-person mesh is not claimed: target acceptance is six players plus several spectators, tested 6+2, with no new artificial cap. Cost if wrong: larger spectator groups may exceed browser bandwidth/CPU and require separate scale acceptance.

## Completion record

All eight Native tasks complete, one final review and one verified fix pass complete. Execution ledger and final check logs are retained locally under `output/native-evidence/`; browser artefacts remain under `output/playwright/`. Only this plan's temporary `.superpowers/sdd/2026-09-30-voice-chat-plan/` workspace is removed after committing its final record. Branch/worktree remain available for the user's integration choice; nothing has been pushed or merged.
