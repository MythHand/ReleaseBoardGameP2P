# Guest Session Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать полный гостевой режим #58: выбор роли, публичную партию, управление зрителями, восстановление и результаты.

**Architecture:** Движок создаёт отдельный `SpectatorView`, а keeper доставляет его принятым наблюдателям вне списка игровых мест. Существующие Board/Table получают явный вариант без собственного игрока и общий поток публичных событий. Допуск, квоты и восстановление остаются под управлением хоста.

**Tech Stack:** TypeScript, React 19, PeerJS, Vitest, CSS Modules, pnpm 9.15.0; Node.js ≥24. Новые зависимости не требуются.

**Spec:** [Согласованный дизайн](2026-09-29-guest-session-mode-design.md), исходный коммит спецификации `e8415160`.

## Global Constraints

- Рабочая копия: `/Users/andreykonnov/Documents/Codex/2026-09-29/new-chat/work/ReleaseBoardGameP2P`; ветка `feat/58-guest-session-mode`, основа `47a41b85`.
- `maxSpectators`: целое 0–28, начальное значение 8; уменьшение ниже текущего числа зрителей запрещено. Отключённым зрителям место не резервируется.
- Смена роли — только в лобби без текущего матча, для обычного человека в лобби; готовность сбрасывается. Хост и боты не переводятся.
- Сохраняются приватный `resumeToken`, защита поколений transport, места игроков и правило хлопушек только победителю.
- Никаких вымышленных PlayerId, собственных рук зрителя, новых правил игры, голосового чата или общей декомпозиции `useLobby`.
- Кодовые комментарии — английские; копи — обе локали через `@release/translation`; UI — Typography, токены и CSS Modules. Тесты страниц — в `__tests__/`.
- Прочитать root/app CLAUDE.md и для анимаций `docs/animations/README.md`, `recipes.md` и актуальный Interaction audit. Использовать существующие presets/anchors.
- Команды ниже запускаются с Node 24 (`PATH=/Users/andreykonnov/.nvm/versions/node/v24.13.0/bin:$PATH`). Исходные 178 файлов / 2200 тестов и `pnpm typecheck` уже прошли; повторная исходная проверка нужна только при изменении основы.
- Каждый продуктовый task: целевой RED → GREEN, затем `pnpm typecheck` и коммит только его файлов. Для ошибки среды сначала отделить её от продуктового сбоя; PeerServer требует разрешения на локальный порт.

## Review Focus

1. Последнее свободное место и замена ещё живого соединения тем же токеном: один участник занимает одну квоту, запоздалый disconnect старого канала не удаляет новый. Тесты Tasks 2/5.
2. Отказ/исключение при асинхронной отправке: человек получает правильную причину, а сразу после решения перестаёт получать broadcasts; закрытие старого канала не закрывает новый. Тесты Task 3.
3. Зритель уже вернулся в лобби, пока хост ещё хранит итоги: reload не отправляет его назад, следующий gameId подключает к новой партии. Тесты Task 5.
4. Первый публичный snapshot приходит до монтажа Board; живое событие приходит во время публичной раздачи: ничего не теряется, catch-up не становится повтором всех анимаций. Тесты Tasks 4/6.
5. Приватное поле внутри публичного pending/event, включая `neutralize503.methods`, слепую передачу и исторический `visibleTo`: оно не попадает ни в wire, ни в persisted log, а разрешённое раскрытие сохраняется. Тесты Tasks 1/4/6.

## File Structure and Ownership

Это один связанный сценарий; отдельные независимые проекты не нужны. Путь плана следует существующей паре `docs/specs/*-design.md` / `*-plan.md`.

| Task | Изменяемые файлы и ответственность |
| --- | --- |
| 1 | `packages/engine/src/{engine,view,index,redact}.ts`, `fake/{index,project,attacks}.ts`; новые публичные типы и проекция. Тесты: `fake/project.test.ts`, `redact.test.ts`. |
| 2 | `apps/frontend/src/network/{types,index}.ts`, `lobby/{state,host}.ts`; Create `lobby/admission.ts` для разбора JOIN_REQUEST и единой политики допуска. Тесты рядом: `admission.test.ts`, `state.test.ts`, `host.test.ts`. |
| 3 | `network/transport/{peer,peer.test}.ts`, `network/session/{memoryNetwork,relay,relay.test}.ts`, транспортные doubles в `network/useLobby.test.ts`, `useLobby.botEvents.test.ts`; принятые соединения и адресное закрытие. |
| 4 | `network/session/{audience,referee,link,remoteLink}.ts`, их `.test.ts`, Create `session/spectator.test.ts`; `features/play-game/useGame.ts`; доставка публичного вида и минимальная совместимость текущего экрана. |
| 5 | `network/useLobby.ts`, `network/useLobby.test.ts`, `shared/lib/{persistence,persistence.test}.ts`; admission/reconnect/модерация и хранение роли. |
| 6 | `entities/game/board/{types,index,toBoardState,toBoardOver,contract.test-d}.ts`, `features/play-game/useGame.ts`, `features/play-game/useGame.test.tsx`, `features/game-intro/{planDeal,isOpening,useDealIntro}.ts`; `pages/board/[gameId]/{index,stats,_Board}.tsx` и его staging hooks; UI `table/Table/types.ts`, `Table.tsx`, `Table.module.css`, `dock.ts`, `intents.ts`, `useTableInteractions.ts`; конкретные расширения перечислены в Task 6. |
| 7 | `features/join-lobby/useJoinLobby.ts`, `pages/lobby/{_InviteScreen,_LobbyView}.tsx` и их `.module.css`, `pages/board/[gameId]/index.tsx`, `apps/ui/src/screens/Lobby/Lobby.tsx`, playground stories и обе `packages/translation/src/locales/{en,ru}/common.json`; реальные controls и эталоны. |
| 8 | `docs/specs/2026-09-29-guest-session-mode-validation.md`; финальная проверка реальной сети и регрессий. Скрипты/снимки проверки — в `work/`, отобранные материалы для пользователя — в `outputs/`. |

## Task 1: Публичный контракт движка

**Interfaces:** Produces `SpectatorView = Omit<PlayerView, 'self'> & { self: null }`, `GameView = PlayerView | SpectatorView`; `Engine.spectate(state: GameState): SpectatorView`; `redactFor(event: Event, viewerId: PlayerId | null): Event`. `project` остаётся строгим API игрока. `pendingView(state, viewerId: PlayerId | null)` получает `mine = viewerId !== null && pendingOwes(...)`.

- [ ] **1. RED:** В `fake/project.test.ts` использовать существующие `config()` и `createGame`. Добавить тест ниже; расширить существующие fixtures всех 11 pending-вариантов проверками `spectate`: `options/piles/methods` пусты, закрытый `release` отсутствует, публичные attack/requested/source/System Upgrade сохранены. Для null-viewer в `redact.test.ts` проверить drawn/blind/named transfer.

```ts
it('projects every seat without giving the spectator a hand', () => {
  const state = createGame(config())
  const view = spectate(state)
  expect(view.self).toBeNull()
  expect(view.opponents.map((p) => p.id)).toEqual(state.seating)
  for (const p of Object.values(state.players))
    for (const card of p.hand) expect(JSON.stringify(view)).not.toContain(card.uid)
  expect(project(state, 'p1').self.hand).toEqual(state.players.p1.hand)
})
```

- [ ] **2. Проверить RED:** `pnpm --filter @release/engine exec vitest run src/fake/project.test.ts src/redact.test.ts` — новый тест падает из-за отсутствующего публичного API.
- [ ] **3. Реализовать:** Общую публичную часть вычислять в `fake/project.ts`; spectate перечисляет все места, выдаёт `canAttackWith: []`, а все owner-only ветки используют null-viewer. `neutralize503/crush.methods` скрывать именно от null-viewer, сохранив существующую семантику PlayerView. Экспортировать типы/API через `index.ts` и `createFakeEngine()`; обновить явные Engine doubles, найденные `rg 'Engine|createFakeEngine'`.
- [ ] **4. GREEN:** Повторить целевую команду; проверить полную engine suite `pnpm --filter @release/engine test` и типы. Публичные открытые карты и tally не должны исчезнуть вместе с приватными.
- [ ] **5. Коммит:** `feat: add public spectator projection (#58)`.

## Task 2: Правила допуска, квот и смены роли

**Interfaces:** Produces `JoinRole = 'player' | 'spectator'`; `JoinRequestPayload = { name: string; resumeToken: string; requestedRole?: JoinRole; resume?: { where: Where; lastGameId: string | null } }`; `JoinAvailability = { player: boolean; spectator: boolean }`. В `admission.ts`: `parseJoinRequestPayload(value: unknown): JoinRequestPayload | null`, `resolveJoinAdmission(state: LobbyState, fromId: string, options: JoinOptions): JoinAdmission`. `JoinOptions` содержит текущие `matchRunning/returningSeat/returningLobbyPeer` плюс `requestedRole`. `JoinAdmission` — `{ accepted: true; role: Role } | { accepted: false; reason: 'room-full'; availability: JoinAvailability }`.

`handleJoinRequest` сохраняет аргументы и возвращает `Result & JoinAdmission`. `LobbyState.maxSpectators: number`, default 8; аргументы `createLobbyState` и patch `applyConfig` расширяются `maxSpectators?: number`. `setMaxSpectators(state, n): Result`, `setParticipantRole(state, peerId, role: JoinRole, matchRunning: boolean): Result`. Экспортировать `LobbyActionError = 'invalid-limit' | 'spectators-full' | 'players-full' | 'match-running' | 'invalid-target'` из `lobby/host.ts`; `Result.error?: LobbyActionError`, остальные поля `state/outgoing` остаются. `JOIN_REJECTED` несёт `{ reason: 'room-full'; availability }`.

- [ ] **1. RED:** Дополнить `host.test.ts`, используя `base(maxPlayers)`: добровольный зритель при свободных местах; fallback; полный/нулевой лимит; returningSeat при полной квоте; обе смены роли/сброс ready; atomic maxPlayers demotion; запрет host/bot/не-лобби. В `admission.test.ts` проверить null, неизвестную роль, испорченный resume, NaN/Infinity/дробный лимит. Числа конфигурации извне не округлять в допустимые.

```ts
it('rejects a spectator when spectating is disabled', () => {
  const state = setMaxSpectators(base(4), 0).state
  const result = handleJoinRequest(state, 's1', 'member-s1', 'Sam', {
    matchRunning: false, requestedRole: 'spectator',
  })
  expect(result.accepted).toBe(false)
  expect(result.state).toBe(state)
  expect(result.outgoing[0].message.type).toBe('JOIN_REJECTED')
})
```

- [ ] **2. Проверить RED:** `pnpm --filter @release/web exec vitest run src/network/lobby` — новые сценарии отсутствуют/не проходят.
- [ ] **3. Реализовать:** Единая policy вызывается до chat admission; из расчёта replacement исключается заменяемый peer. Два последовательных запроса последнего слота дают одного accepted и одного rejected. Лимиты проверяются в хосте; число гостей считается по roster. `handleReady` игнорирует guest. `setMaxPlayers` проверяет суммарную квоту до любой демоции, сохраняет порядок и старую нормализацию 2–6 для валидного численного ввода. Добавить поле ко всем config round-trips; отсутствующее legacy поле = 8.
- [ ] **4. GREEN:** Та же команда плюс `pnpm typecheck`. Действующие player/bot тесты сохраняют поведение. Пока UI не подключён, новые методы остаются чистыми функциями.
- [ ] **5. Коммит:** `feat: define spectator admission and lobby limits (#58)`.

## Task 3: Допуск к рассылкам и гарантированное закрытие

**Interfaces:** `Transport.disconnectPeer(peerId: string, finalMessage?: Message): Promise<void>`. Метод сразу исключает конкретную generation из входящих сообщений/списка каналов/broadcast/relay, уведомляет `onDisconnect` один раз, отправляет finalMessage через захваченный канал и закрывает только его. PeerJS установленной версии поддерживает `DataConnection.close({ flush: true })`; сначала дождаться `send`, затем flush-close. Double в memoryNetwork реализует тот же observable контракт.

- [ ] **1. RED:** В `peer.test.ts` добавить сценарии pending/accepted broadcast, relay в непринятый адрес, rejection перед закрытием, повторный close и replacement во время незавершённого send. Использовать существующий mock connection; send последнего пакета возвращает управляемый Promise.

```ts
// After disconnectPeer(oldId, rejection), before releasing the pending send:
expect(transport.connectedIds()).not.toContain(oldId)
transport.broadcast(publicMessage)
expect(oldConnection.send).toHaveBeenCalledTimes(1) // rejection only
// Resolve the send; await disconnect. A replacement channel must remain open.
expect(oldConnection.close).toHaveBeenCalledWith({ flush: true })
expect(newConnection.close).not.toHaveBeenCalled()
```

- [ ] **2. Проверить RED:** `pnpm --filter @release/web exec vitest run src/network/transport/peer.test.ts src/network/session/relay.test.ts`.
- [ ] **3. Реализовать:** Direct send до admission нужен для ответа хоста, broadcast/relay — только authenticated generations. Сохранить механизм stamps `from` и stale-channel guards. `JOIN_REJECTED` добавить в NEVER_RELAYED. При send failure закрыть захваченный канал без необработанного rejection. Обновить все явные Transport doubles, включая `memoryNetwork` и useLobby tests; не отключать auth в tests для удобства.
- [ ] **4. GREEN:** Повторить тесты и типы. Проверить, что обычное исходящее соединение клиента с хостом сохраняет текущую инициализацию authenticated.
- [ ] **5. Коммит:** `feat: close rejected spectator connections safely (#58)`.

## Task 4: Публичный поток keeper и запрет игровых действий

**Interfaces:** Consumes Task 1. `Session.spectators: string[]`; createSession принимает необязательные `spectators?: string[]` и нормализует к []. В `referee.ts`: `watch(session: Session, peerId: string): SessionResult`, `unwatch(session, peerId): SessionResult`, `spectatorSyncMessage(session, events, resync = false): Message`. `KeeperHandle.watch(peerId)` / `.unwatch(peerId)` сохраняют результат тем же commit-path. `SYNC.view` и `Sync.view` становятся `GameView`; `forViewer(events: Event[], viewerId: PlayerId | null): Event[]` реализует публичную аудиторию.

- [ ] **1. RED:** Create `session/spectator.test.ts` поверх createSession/createMemoryNetwork/attachKeeper: один host, один player, два observers. `watch` возвращает всю публичную историю с resync; следующие human/bot/ticker изменения получают оба наблюдателя; disconnect/unwatch останавливает доставку. В `audience.test.ts` добавить null-viewer к private/mixed/named transfer cases.

```ts
// Arrange a normal two-seat session, then watch(session, 'spectator-peer').
expect(sync.view.self).toBeNull()
expect(sync.view.opponents).toHaveLength(2)
expect(sync.resync).toBe(true)
expect(sync.events).toEqual(forViewer(session.log, null))
expect(applyIntent(watched, 'spectator-peer', { type: 'DRAW' }, 1000))
  .toEqual({ session: watched, outgoing: [] })
```

- [ ] **2. Проверить RED:** `pnpm --filter @release/web exec vitest run src/network/session/spectator.test.ts src/network/session/audience.test.ts src/network/session/remoteLink.test.ts`.
- [ ] **3. Реализовать:** `syncAll` создаёт общий public payload один раз и адресует только spectators. Rejection игрока не рассылается зрителям. `watch` идемпотентен по peerId и не принимает адрес игрового места. `disconnect` удаляет observer, не создаёт absent seat. Keeper отсеивает непосаженных отправителей до early-intent buffer и intro gate. Restore/adopt всегда очищает runtime observers; существующие исходные session fixtures получают []. Поддержать GameView в remote link и захвате первого SYNC до subscribe страницы.
- [ ] **4. Сохранить рабочий промежуточный контракт:** До Task 6 `useGame` явно сужает полученный GameView до PlayerView, возвращая view:null для `self:null`; публичный sync остаётся доступен в `session.gameSync`. Это временная совместимость с ещё не перенесённым экраном, без cast и вымышленного игрока; Task 6 снимает это сужение. Явные player assertions в старых тестах сужают тип.
- [ ] **5. GREEN и коммит:** Повторить целевые tests, `pnpm --filter @release/web exec vitest run src/network/session`, типы; `feat: synchronize read-only spectator sessions (#58)`.

## Task 5: Полный lifecycle комнаты и сохранение

**Interfaces:** `UseLobby.joinRoom(code: string, name: string, requestedRole?: JoinRole): Promise<string>`; приватная `dialRoom(code: string, name: string, options: DialOptions): Promise<string>` использует `DialOptions = { requestedRole: JoinRole; resume?: JoinRequestPayload['resume']; onDialOutcome?: (outcome: DialOutcome) => void; preserveSession?: boolean }`, чтобы не спутать новый аргумент с нынешним callback. `UseLobby.setMaxSpectators(n): void`, `.setParticipantRole(peerId, role): void`, `.lobbyActionError: LobbyActionError | null`, `.joinAvailability: JoinAvailability | null`. `ErrorKind` дополняется `room-full`. `StoredSession.participantRole?: JoinRole`, `.where?: Where`; `StoredLobbyConfig.maxSpectators?: number`, нормализованный config содержит обязательное число.

- [ ] **1. RED:** Дополнить текущий useLobby.test.ts с его FakeTransport (не копировать harness в новый файл). Проверить: статус connecting до PEER_LIST; добровольный watcher до старта; поздний вход; первый sync раньше монтажа; room-full без chat.admit/roster; same-token replacement при полной квоте; отказ после host reload; guest INTENT/INTRO_READY/PLAYER_READY/PICK_PREVIEW; управление из non-host; kick с поздними callbacks; полный цикл stats→lobby→reload→rematch. В persistence.test.ts — старый формат и новые поля.

```ts
// In the existing hook harness, start a host with two players and one watcher.
expect(typesSentTo(watcher)).toEqual(expect.arrayContaining(['PEER_LIST', 'GAME_STARTING', 'SYNC']))
expect(typesSentTo(watcher).indexOf('GAME_STARTING')).toBeLessThan(typesSentTo(watcher).indexOf('SYNC'))
expect(publicSyncTo(watcher).view.self).toBeNull()
// After WHEREABOUTS(lobby), reconnect with resume { where:'lobby', lastGameId }:
expect(typesSentTo(reconnectedWatcher)).not.toContain('GAME_STARTING')
// Start a different gameId: GAME_STARTING and public SYNC must now arrive.
```

`typesSentTo`/`publicSyncTo` — новые test-only selectors над существующим `sentTo`, возвращающие соответственно `Message['type'][]` и narrowed SYNC payload; они ничего не отправляют и не создают входные данные.

- [ ] **2. Проверить RED:** `pnpm --filter @release/web exec vitest run src/network/useLobby.test.ts src/shared/lib/persistence.test.ts`.
- [ ] **3. Реализовать admission:** Parse/resolve до `chatSession.admit`. Сначала исключить заменяемую generation из получателей, затем принять/аутентифицировать новый канал и публиковать roster. Успешный onDialOutcome вызывается из принадлежащего этой попытке onMessage после подтверждённого PEER_LIST от ожидаемого хоста, не из onConnection и не через общий изменяемый callback-ref. Для обычного отказа final JOIN_REJECTED идёт через Task 3; для kick target получает final PLAYER_KICKED, остальные — один broadcast. Нет двойного chat leave. Сохранить token→seat приоритет и проверку владения transport на каждом async continuation.
- [ ] **4. Реализовать viewing lifecycle:** Отдать GAME_STARTING до watch/catch-up. На старте seed observers из guest roster; WHEREABOUTS(lobby), leave/kick снимают подписку; новый матч набирает её заново. Пара `resume.where` / `resume.lastGameId` подавляет только повторное открытие совпадающего старого матча. Сохранить выбранную/назначенную роль при PEER_LIST и self PEER_JOINED; reconnect room-full терминален до Retry. Финальные frame/status не теряются при disconnect.
- [ ] **5. Реализовать управление и guards:** Методы UseLobby вызывают Task 2 только на хосте, публикуют error reason при отказе и системную смену роли при успехе. Валидировать PICK_PREVIEW по действующему seat и gameId перед relay; зритель не обходит ограничения вызовом API напрямую. Persist maxSpectators во всех lobby/keeper paths; runtime observers не сериализовать.
- [ ] **6. GREEN и коммит:** Целевые tests плюс `src/network/useLobby.botEvents.test.ts`, типы; `feat: restore and moderate spectator room membership (#58)`.

## Task 6: Настоящий стол зрителя, публичная раздача и результаты

**Interfaces:** Выделить общий payload Board/Table и union identity: player `{ selfId: string; you: PlayerHud }`, spectator `{ selfId: null; you: null }`. `PlayerHud` — именованный прежний non-null shape `you` соответствующего Board/Table. Экспортировать `PlayerBoardState`, `SpectatorBoardState`, `isPlayerBoard(state): state is PlayerBoardState`; аналогичные `PlayerTableState/SpectatorTableState/isPlayerTable` в UI. `toBoardState(view: GameView, log: Event[], labels: HistoryLabels): BoardState`, `toBoardOver(view: GameView)`. `Game.view` в useGame = `GameView | null`, gameplay submit при self:null — no-op. `BoardProps.playback?: { events: Event[]; restoredThrough: number }` передаёт feed независимо от `intro`; fallback на старый intro feed оставлен для существующих fixtures/debug callers. `BoardProps.intro.view` и аргумент `useDealIntro.view` расширяются до `GameView | null`.

**Additional files:** UI `table/TurnDock/TurnDock.tsx` и `Table/index.ts`, `apps/ui/src/index.ts`; frontend `features/board-beats/planBeats.ts`, `withoutFlown.ts`, `toHand.ts`, `useBeats.ts`, `operationBeat.tsx`, `transferBeat.tsx`, `comboBeat.tsx`, `defenseBeat.tsx`, `discardBeat.tsx`, `handLimitBeat.tsx`, `aiBeat.tsx`, `upgradeBeat.tsx`. Сохранить имена/обязанности существующих модулей. Правки локальных staging hooks `_useBoardStaging.ts`, `_useDefenseStaging.tsx`, `_useNeutralizeStaging.tsx`, `_useCherryPickStaging.tsx`, `_useRebaseStaging.tsx`, `_useRequestStaging.tsx`, `_useUpgradeStaging.tsx` ограничены guard/пустыми результатами для viewer без места. Тесты: существующие adapter/dock/interaction/intro/beats и Create `pages/board/[gameId]/__tests__/spectatorBoard.test.tsx`, `apps/ui/src/table/Table/Table.spectator.test.tsx`.

- [ ] **1. RED:** Adapter из реального engine.spectate даёт `you:null/selfId:null`, все места, публичную историю/итоги. Render tests 2/4/6 мест: нет board-you/Hand/ReleaseZone зрителя и игровых controls; хоткеи не вызывают actions. В `planDeal.test.ts` spectate создаёт только seat flights, `hand:[]`, face-up лишь из `dealt.open`. В beats tests публичные draw/transfer/release/defend/AI/System Upgrade не обращаются к own-hand anchors. Для resync очередь не планирует старые events. Rerender с игрока с активной staged-картой на зрителя очищает private overlays, жесты и старые callbacks.

```ts
const view = engine.spectate(state)
const board = toBoardState(view, publicEvents, labels)
expect(board.you).toBeNull()
expect(board.selfId).toBeNull()
expect(board.opponents.map((p) => p.id)).toEqual(state.seating)
const plan = planDeal(view, engine.setupEvents(state))!
expect(plan.hand).toEqual([])
expect(plan.flights.every((flight) => flight.to.kind === 'seat')).toBe(true)
```

- [ ] **2. Проверить RED:** `pnpm --filter @release/web exec vitest run src/entities/game/board src/features/game-intro src/pages/board/\[gameId\]/__tests__/spectatorBoard.test.tsx`; `pnpm --filter @release/ui exec vitest run src/table/Table`.
- [ ] **3. Перенести контракт и публичные эффекты:** Сохранить двусторонние assertions contract.test-d отдельно для player/spectator. Обновить null guards без non-null assertions, фиктивной руки и условного вызова hooks. Player-only hook сохраняет стабильный порядок вызовов, но не ставит listeners и не выполняет действия при отсутствии player identity; при смене identity/gameId очищает private staging и overlays. `withoutFlown` сохраняет you:null; all player-specific animation branches требуют isPlayerBoard. `toHand` недоступен в observer path. Отдельный публичный feed подаётся в useBeats даже без личного intro. Типизированные player fixtures остаются PlayerBoardState там, где тестирует собственную руку.
- [ ] **4. Подключить публичную раздачу:** `planDeal(view: GameView, events: Event[])` возвращает общий DealPlan, но у spectator только seat targets и пустая hand. `isOpening(view: GameView)`/useDealIntro используют публичные признаки старта и resync watermark. BoardPage передаёт intro обоим видам зрителя/игрока; callback onDone вызывает session.introReady только для собственного действующего места, для зрителя завершает лишь локальное вступление. Зритель видит ту же последовательность public flights, не отправляет INTRO_READY и не блокирует keeper. Живые события, пришедшие во время раздачи, остаются в очереди; restoredThrough предотвращает запуск intro на catch-up. Начальный стол до первого sync не выдаётся за готовый spectator state.
- [ ] **5. Отрисовать и связать страницу:** Нет own-zone/hand/action hotkeys. Dock observer всегда read-only, отображает текущего игрока; `deriveDock/isCounting` принимают `string | null`, spectator не попадает в attack/PASS branch. Существующая локализованная отметка spectator передаётся через copy; новые копи при необходимости — обе локали. Layout ≤3 мест — один ряд, 4–6 — два ряда по ≤3, без перекрытия центра. stats использует public tally, viewer не становится игроком/победителем. Снять временное сужение useGame из Task 4; submit guard остаётся.
- [ ] **6. GREEN и коммит:** `pnpm --filter @release/web test`, `pnpm --filter @release/ui test`, типы. Действующие local-drag/handoff и winner-only tests должны пройти вместе со spectator cases. `feat: render the public spectator board and results (#58)`.

## Task 7: Вход, управление и playground

**Interfaces:** Consumes UseLobby из Task 5; `useJoinLobby(): (code: string, name: string, role?: JoinRole) => Promise<string>`. Page передаёт `spectatorLimit/onSpectatorLimitChange` существующему room API. `makeSpectatorTable(playerCount: 2 | 3 | 4 | 5 | 6): SpectatorTableState` добавляется в `apps/ui/src/mocks/table.ts`; shape согласован с публичным engine view, без скрытых рук.

**Files:** Из таблицы ownership плюс тесты `pages/lobby/__tests__/{inviteScreen,lobby,lifecycle}.test.tsx`, board `__tests__/stats.test.tsx`; stories `InviteStory/InviteStory.tsx`, `LobbyStory/LobbyStory.tsx`, `TableStory/TableStory.tsx`, `TableChatStory/TableChatStory.tsx`, `StatsChatStory/StatsChatStory.tsx`, `AnimationAuditStory/AnimationAuditStory.tsx`; `docs/animations/{recipes,backlog}.md`.

- [ ] **1. RED:** Через UI выбрать spectator при свободных player seats → joinRoom получает role. Во время dial форма заблокирована до PEER_LIST; room-full показывает существующий full status, Retry сохраняет выбранную роль. Хост видит лимит 8 с диапазоном 0–28 и команды перевода; non-host не видит controls. При заполнении квоты dropdown disabled/hint; отказ уменьшения maxPlayers даёт локализованное объяснение. Чат зрителя и self label корректны после role change.

```ts
// Existing Invite screen render harness:
await user.click(screen.getByRole('button', { name: 'зритель' }))
// Fill valid nickname/code through the existing Form helpers, then join.
expect(session.joinRoom).toHaveBeenCalledWith(code, nickname, 'spectator')
// Existing Lobby harness: state.maxSpectators=8, one guest.
expect(screen.getByText('1 / 8')).toBeVisible()
```

- [ ] **2. Проверить RED:** `pnpm --filter @release/web exec vitest run src/pages/lobby/__tests__ src/pages/board/\[gameId\]/__tests__/stats.test.tsx`.
- [ ] **3. Реализовать:** Существующий выбор роли подключить к state/Form, ошибки — через каталог. Подключить spectator slider и moderation dropdown по эталону Lobby, убрать возможность уменьшения ниже занятых мест. `lobbyActionError` отображается рядом с controls и сбрасывается следующей попыткой. Тот же limit работает в Board settings. Guest player и spectator различаются по roster role, не по `isHost`.
- [ ] **4. Обновить эталоны:** В TableStory отдельные оси administrative role и viewer role; примеры 2/4/6 мест, late join, reconnect, results. В Lobby прототипе применить согласованные правила квоты, а не прежний свободный mock slider. Обновить public animation audit/recipes, сохранить исторические находки и winner-only правило. Вручную сравнить production и playground на 1280×720 и 1920×1080, с панелью чата и без неё.
- [ ] **5. GREEN и коммит:** Целевые tests, `pnpm typecheck`, `pnpm lint`; `feat: enable spectator joining and host controls (#58)`.

## Task 8: Реальная сеть, регрессии и передача результата

**Interfaces:** Продуктовых API не добавляет. Produces `docs/specs/2026-09-29-guest-session-mode-validation.md` с проверенным commit SHA, командами/результатами, браузерными сценариями и точными ограничениями. Использовать playground и настоящий frontend; визуальный success не подменяет проверку wire.

- [ ] **1. Полная проверка:** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`. Сохранить вывод в work; каждая команда exit 0. Исходный счётчик 2200 — справочный baseline, новые тесты увеличат его. Если обнаружен сбой, применить systematic-debugging и исправить в owning task с его RED/GREEN.
- [ ] **2. Настоящие браузеры:** Прочитать playwright skill; запустить `pnpm dev:p2p` на разрешённом локальном порту и `pnpm dev:playground`. Три изолированных browser contexts: host, player, spectator. Выполнить вход до/после старта, public draw/attack, чат, reload зрителя, reload хоста, kick, итоги, lobby reload и rematch. Отдельно проверить заполненную квоту и партию с ботом. Использовать реальный frontend transport; перехват полученных DataChannel payload допускается только наблюдательный, без подмены данных.
- [ ] **3. Сверить приватность и изображение:** Для observer frames проверить absence закрытых uid/seed/deck order и приватных event payload; публичный `dealt.open` разрешён. В DOM и снимках — все 2/4/6 seats, читабельный HUD, корректные public flights/anchors и отсутствие активных действий. Опубликовать в validation только наблюдавшиеся результаты; локальный результат не объявлять проверкой deployed сайта.
- [ ] **4. Коммит отчёта и review:** `docs: record guest session validation (#58)`. Зафиксировать точный head SHA для независимого review всего изменения с базой `47a41b85`/актуальной базой ветки. Для выбранного метода исполнения применить соответствующий review skill. Исправления найденных дефектов получают отдельные целевые проверки; повторять весь набор без новых причин не нужно.
- [ ] **5. Завершение:** Применить finishing-a-development-branch. Перед push/PR назвать `MythHand/ReleaseBoardGameP2P`, ветку `feat/58-guest-session-mode`, base `main` и действие; не менять согласованный объём и не включать voice-chat/refactor ветки. При создании PR использовать шаблон, связать #58 и attach_artifact. Этот план сам по себе не объявляет ни реализацию, ни публикацию завершённой.

## Coverage and Execution Handoff

| Spec | Tasks |
| --- | --- |
| 1–2: цель и существующие эталоны | Все; 7 связывает production с playground |
| 3–4: роли, вход, лимиты, управление | 2, 3, 5, 7 |
| 5: публичная проекция | 1, 4 |
| 6: доставка и доступ | 3, 4, 5 |
| 7: стол, раздача, анимации, результаты | 6, 7 |
| 8: сохранение и повторное подключение | 5, 6, 8 |
| 9–10: границы и критерии приёмки | Global Constraints; каждый task; 8 |

План проверяется владельцем до продуктовых изменений. Рекомендация — **Native**: выполнить связанные изменения одним исполнителем в этой сессии, затем независимое review всей ветки. Здесь много общих типов и последовательных lifecycle-зависимостей; отдельный контекст на каждую правку создаёт больше повторного чтения. Альтернатива **Subagent-driven** — отдельные implementer/reviewer на каждом task с дополнительной независимой проверкой промежуточных результатов и большими затратами контекста. Способ исполнения ещё не выбран.
