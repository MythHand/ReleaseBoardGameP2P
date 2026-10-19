# Frontend Loading Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the start screen sooner and reduce repeat downloads after updates while preserving live P2P sessions.

**Architecture:** Keep the start shell eager, compose file-based routes with generouted's public core, and defer session ownership and other screens behind explicit loading boundaries. Keep the session provider's position stable, load rules as hashed JSON assets on demand, and isolate measured third-party groups from application chunks.

**Tech Stack:** React 19, React Router 8.0.1, generouted 1.20.2, frontend Vite 6.4.3/Rollup, TypeScript, i18next, Vitest, Chromium. Use Node >=24 and pnpm 9.15.0; retain the lockfile versions.

**Spec:** [2026-10-19-frontend-loading-performance-design.md](./2026-10-19-frontend-loading-performance-design.md)

## Global Constraints

- Keep `/`, `/start`, the root shell, and required start visuals/styles eager.
- A new visitor must not fetch the engine, PeerJS, voice runtime, board, statistics, forms, or rules text at start.
- Preserve storage keys, tab-scoped storage, in-memory fallback, validation, expiry, and clear/write semantics.
- Once activated, the runtime owner stays mounted across route and modal changes; preserve explicit leave/disband cleanup.
- Retain file-based discovery, generated route types, basename/direct links, root error handling, and reduced motion. Never hand-edit `app/router.ts`.
- Keep both languages' common UI catalogs eager; preserve `rules`/`rulesBlock` keys, typed translations, English fallback, and complete playground catalogs.
- Keep CSS splitting and content-hashed assets; do not group all UI or dependencies together or blanket-mark CSS side effects as removable.
- Never automatically reload during an active session. Failed loads have explicit retry and, when necessary, explicit refresh.
- Use existing UI primitives, CSS Modules/tokens, English source comments, and translations in both languages. No new literal UI copy in TSX.
- Exclude SSR/prerendering, service workers, hosting migration, asset redesign, engine rules, and unrelated dependency upgrades.
- Before implementation, use `using-git-worktrees`: respect the project's issue/branch naming and create isolated work at `.worktree/<task-name>` if needed. Keep this work separate from the current DDoS fix branch; carry the approved documents into the implementation branch without duplicating the DDoS fix.

## Review Focus

1. A delayed modal import resolves after close/back: it must not reopen content, steal focus, or remount start. Pin in Task 4.
2. Concurrent activation plus reload of a stored host/guest must produce one owner and the existing restore ordering. Pin in Tasks 2 and 4.
3. Closing rules or changing language while a resource loads must not display stale-language content or lose English fallback. Pin in Task 5.
4. A production chunk fails during an active session: retry/refresh controls must preserve that owner and must not loop reloads. Pin in Tasks 3, 6, and 8.
5. A shared UI re-export or vendor grouping pulls table CSS/network code back into start. Pin with production-graph assertions in Tasks 1, 7, and 8.

## File and interface map

All paths below are relative to the repository root. Existing compatibility exports stay in place until all consumers pass.

| Unit | Files and responsibility |
|---|---|
| Measurement | New `apps/frontend/perf/build-report.mjs`, `assert-start.mjs`; new `docs/performance/2026-10-19-frontend-loading.md` records evidence |
| Lightweight storage | New `shared/lib/storage.ts`, `shared/lib/sessionPersistence.ts`; existing `shared/lib/persistence.ts` re-exports session APIs and retains keeper/chat/log behavior |
| Deferred loads | New `shared/lib/moduleResource.ts`, `shared/ui/DeferredContent.tsx`, `shared/ui/LoadingStatus.tsx`, `shared/lib/loadFailure.ts` |
| Stable session owner | New `app/providers/sessionStore.ts`, `SessionRuntime.tsx`, `SessionActivation.tsx`, `SessionGate.tsx`; modify `SessionProvider.tsx` while retaining `useSession()` import compatibility |
| Routing | New `app/routes.tsx`, `app/routeModules.ts`, `app/buildRoutes.ts`; modify `app/main.tsx` and `pages/_app.tsx` |
| Modals | Modify `app/AppModals.tsx`; lazy imports belong in that app composition module |
| Rules data | New `packages/translation/src/common.ts`, `rulesResources.ts`, `assets.d.ts`; modify translation init and exports; retain static `catalog.ts` |
| Rules views | Modify `features/rules/Rules.tsx`; new `features/rules/useRulesResource.ts`; modify board route and UI Table slots, retaining existing playground behavior |
| Public UI entries | New `apps/ui/src/start.ts`, `src/foundation.ts`; update UI exports and consuming aliases/path mappings |
| Build chunks | New `apps/frontend/build/vendorChunks.ts`; modify frontend Vite config only after module report |

Frontend files in this table are under `apps/frontend/src/` unless explicitly qualified.

## Task 1: Establish a reproducible production baseline

**Files:** Create `apps/frontend/perf/build-report.mjs`, `apps/frontend/perf/assert-start.mjs`, `docs/performance/2026-10-19-frontend-loading.md`.

**Interfaces:** `node apps/frontend/perf/build-report.mjs --out <absolute-directory>` builds production source with the existing Vite config and emits `dist/`, `chunks.json`, and `sizes.json` under that directory. Each chunk record includes `file`, `isEntry`, `imports`, `dynamicImports`, and module IDs/rendered lengths; size records include raw/gzip/Brotli bytes. Also emit Vite's manifest for CSS/asset dependency inspection. No report injection into normal published builds.

- [ ] **Step 1:** Record source SHA, Node/pnpm/Chromium versions, lockfile hash, public build settings, and base `/ReleaseBoardGameP2P/`. Never write TURN credentials into reports. Implement the report script using Vite's programmatic `build()` with `configFile` pointing to the existing frontend config, an explicit root/outDir, `manifest: true`, and an additional reporting plugin. Keep the original config/plugins.
- [ ] **Step 2:** Run `node apps/frontend/perf/build-report.mjs --out /tmp/release-fe-baseline`. Confirm the build succeeds and every emitted JS/CSS file has a size record; preserve the output for comparison. Check `git diff` for unintended generated-router changes.
- [ ] **Step 3:** Use the `playwright` skill and its available runtime for browser measurements; no product dependency is required. Serve that production build at its real base, including SPA fallback. Measure `/` and `/start` in five new contexts each: Chromium, 1440×900, `en`, cold HTTP cache/storage, CDP download 200,000 B/s, upload 93,750 B/s, latency 150 ms, CPU slowdown 4. Finalize LCP after a fixed 10-second observation window; record its element and screenshot, FCP, LCP, JS task time, request bytes, photo/logo/fonts, and request failures. An unfinished screen is a failed sample, not a faster measurement.
- [ ] **Step 4:** Implement `assert-start.mjs <report-directory> <request-log.json>`: union the static entry dependency closure with observed JS/CSS requests, then reject engine modules, `peerjs`, network/voice, board/stats routes, form implementations, locale rules text, and board-only CSS modules. Store its structured findings; run it against baseline and expect failure naming the current eager dependencies. Emitted but unrequested async assets are not initial requests. Permit tiny module URL maps without their content.
- [ ] **Step 5:** Add the baseline table and exact browser/server commands to the report. Check `git diff --check`; commit only these measurement files: `chore: record frontend loading baseline`.

## Task 2: Separate engine-independent persisted session access

**Files:** Create `apps/frontend/src/shared/lib/storage.ts`, `sessionPersistence.ts`, `sessionPersistence.test.ts`; modify `persistence.ts`, `persistence.test.ts`.

**Interfaces:** `storage.ts` exports `read(key: string): string | null`, `write(key: string, value: string): void`, `remove(key: string): void`, `readJson<T>(key: string): T | null`. `sessionPersistence.ts` owns the existing `RESTORE_TTL_MS = 12 * 60 * 60 * 1000`, `StoredSession`, `StoredLobbyConfig`, `readSession(now?: number): StoredSession | null`, `writeSession(s: StoredSession): void`, `clearSession(): void`, `getResumeToken(roomCode: string): string`. The old persistence module re-exports those exact names.

- [ ] **Step 1:** Add tests through the new lightweight import: session round-trip at `joinedAt`, validity exactly at the TTL, expiry at `RESTORE_TTL_MS + 1`, malformed JSON cleanup, same-room token reuse, cross-room token rotation, and no writes to localStorage. Exercise existing fallback behavior with storage access throwing; read/write/clear through new and old imports must share the same fallback map.

  ```ts
  writeSession({ roomCode: 'ABC-123', name: 'Ann', role: 'guest', gameId: null, joinedAt: 0 })
  expect(readSession(RESTORE_TTL_MS)?.roomCode).toBe('ABC-123')
  expect(readSession(RESTORE_TTL_MS + 1)).toBeNull()
  ```

- [ ] **Step 2:** Run `pnpm --filter @release/web exec vitest run src/shared/lib/sessionPersistence.test.ts src/shared/lib/persistence.test.ts`; expect the new import to fail before implementation.
- [ ] **Step 3:** Move the storage primitives once, then move session/config/credential definitions without altering semantics. Leave event parsing and keeper/log/chat consumers in `persistence.ts`, using the shared storage module. Do not introduce additional session-shape validation or schema changes in this extraction.
- [ ] **Step 4:** Rerun the command and `pnpm --filter @release/web typecheck`; expect pass. Confirm the new reader's transitive imports contain no engine/runtime. Commit: `refactor: separate lightweight session persistence`.

## Task 3: Add retryable deferred resources and localized loading UI

**Files:** Create `shared/lib/moduleResource.ts`, `moduleResource.test.ts`, `shared/lib/loadFailure.ts`, `loadFailure.test.ts`, `shared/ui/DeferredContent.tsx`, `DeferredContent.test.tsx`, `LoadingStatus.tsx`, `LoadingStatus.module.css`. Modify both `packages/translation/src/locales/{en,ru}/common.json`.

**Interfaces:** `createModuleResource<T>(importer: () => Promise<T>): ModuleResource<T>` returns `{ load(): Promise<T>, peek(): T | undefined, retry(): Promise<T> }`. Share an in-flight promise, retain success, and discard rejected promises. `DeferredContent<T>` props are `{ resource: ModuleResource<T>; children: (module: T) => ReactNode; fallback?: ReactNode }`. `LoadingStatus` props are `{ error?: unknown; onRetry?: () => void; onRefresh?: () => void }`. `classifyLoadFailure(error: unknown, online: boolean): 'offline' | 'load' | 'application'` treats known import/preload failures as load errors without misclassifying arbitrary render exceptions.

- [ ] **Step 1:** Add tests `deduplicates concurrent loads`, `retains successful module`, `retry reinvokes importer after rejection`, `does not refresh automatically`, and `unmounted deferred content ignores completion`. Assert importer counts 1 for concurrent success and 2 after one rejection plus retry; successful mounted content is not recreated by unrelated parent renders.

  ```ts
  const importer = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue('loaded')
  const resource = createModuleResource(importer)
  await expect(resource.load()).rejects.toThrow('offline')
  await expect(resource.retry()).resolves.toBe('loaded')
  expect(importer).toHaveBeenCalledTimes(2)
  ```

- [ ] **Step 2:** Run `pnpm --filter @release/web exec vitest run src/shared/lib/moduleResource.test.ts src/shared/lib/loadFailure.test.ts src/shared/ui/DeferredContent.test.tsx`; expect missing-module failures.
- [ ] **Step 3:** Implement the interfaces without using a permanently rejected `React.lazy` instance. Deferred UI owns its attempt state and invokes `resource.retry()` from the retry action. Use existing Button/Typography and inline status text, not the heavy full-screen boot sequence. Add typed `loading.status`, `loading.failed`, `loading.offline`, `loading.retry`, and `loading.refresh` strings in both catalogs. Refresh is an explicit button calling reload; never an effect, timer, or global preload-error reload handler.
- [ ] **Step 4:** Rerun tests and frontend typecheck. A native module evaluation failure can remain cached by the browser; do not promise to repair application exceptions or a deleted deployment chunk with retry. Browser transient-fetch recovery is verified in Task 8; persistent failure keeps the explicit refresh action. Commit: `feat: add recoverable deferred content loading`.

## Task 4: Activate one persistent session runtime on demand

**Files:** Create `app/providers/sessionStore.ts`, `sessionStore.test.ts`, `SessionRuntime.tsx`, `SessionActivation.tsx`, `SessionGate.tsx`, `SessionActivation.test.tsx`; modify `SessionProvider.tsx`, its existing test, `app/main.tsx`, `pages/_app.tsx`, `app/AppModals.tsx`, `pages/lobby/__tests__/lifecycle.test.tsx`.

**Interfaces:** `SessionRuntimeComponent = ComponentType<{ publish(value: UseLobby): void }>`; `createSessionStore(loadRuntime: () => Promise<{ default: SessionRuntimeComponent }>): SessionStore` returns a stable store with `subscribe(listener: () => void): () => void`, `getSnapshot(): SessionSnapshot`, `getRuntime(): SessionRuntimeComponent | null`, `request(): Promise<void>`, `retry(): Promise<void>`, and `publish(value: UseLobby): void`. Both activation promises settle when a first value is published, or reject on load failure. `SessionSnapshot` is a discriminated union with `status: 'idle' | 'loading' | 'error' | 'ready'`, `error: unknown` on error and `value: UseLobby` on ready. `SessionProvider({store, children}: {store: SessionStore; children: ReactNode})` provides that stable store and owns the runtime driver as a sibling of `children`. `useSessionStore(): SessionStore` returns the context store; `useSession()` retains its existing return type and compatibility import and reads only ready snapshots. `useSessionStatus(): SessionSnapshot` exposes activation state. `SessionGate({children}: {children: ReactNode})` shows Task 3 status/retry until ready. `SessionActivation()` runs within router context and requests activation for session routes, create/join query modals, or a saved session.

- [ ] **Step 1:** Add tests: cold `/start` never calls the runtime importer; create/join/direct lobby/direct board/direct stats/valid stored session do; expired storage does not; two triggers cause one load. Close/back during a pending modal import must not reopen the modal or change start mount count. A typed name survives unrelated coordinator updates. Late activation must not insert a new ancestor around an existing start screen.
- [ ] **Step 2:** Add lifetime tests: lobby → board → stats → start → next match mounts one runtime owner; a failed feature load leaves that owner mounted; runtime import failure supports retry; StrictMode does not create duplicate transport effects beyond existing hook semantics. Keep existing host/guest restore and provider tests.

  ```ts
  expect(runtimeImporter).toHaveBeenCalledTimes(1)
  expect(runtimeMounts).toBe(1) // after the complete route sequence, outside StrictMode
  expect(runtimeUnmounts).toBe(0)
  expect(startMountsAfterOpeningModal).toBe(startMountsBeforeOpeningModal)
  ```

- [ ] **Step 3:** Run `pnpm --filter @release/web exec vitest run src/app/providers`; expect the new activation assertions to fail before implementation.
- [ ] **Step 4:** Implement the stable store/context, using type-only `UseLobby` imports. `SessionRuntime` alone imports/calls `useLobby` and publishes snapshots in a layout effect; it does not subscribe to its own published value. Subscribe the provider's driver to `getRuntime()` with `useSyncExternalStore`; publish a notification when that component becomes available so it can mount while activation is still loading. Consumers subscribe to `getSnapshot()`. Mount the driver once at a stable sibling position after its module loads. Construct one store in `main.tsx` with `() => import('./providers/SessionRuntime')` and pass it to `SessionProvider` above `RouterProvider` so route error boundaries cannot remove the live owner. Update existing test providers to inject their own store. `SessionActivation` lives inside router context; after ready it defers the existing `app/FollowGameStart.tsx` through a Task 3 resource. Preserve existing restore logic inside `useLobby`.
- [ ] **Step 5:** Convert create/join content in `AppModals` to stable module resources from Task 3; render each only when selected and session ready. Leave modal framing/query/close and retained exit content in `ModalRouter`. Forms and routes must never call `useSession()` while idle: wrap modal content and the session-route outlet branch in `SessionGate`, keeping the start branch stable. Successful runtime activation remains latched until application unmount; explicit session leave still runs existing cleanup.
- [ ] **Step 6:** Rerun provider tests and `pnpm --filter @release/web exec vitest run src/pages/lobby/__tests__ src/pages/__tests__/start.test.tsx src/shared/lib/persistence.test.ts`; expect pass. Inspect start module imports for runtime leakage. Commit: `feat: load session runtime when needed`.

## Task 5: Load rules resources and content on demand

**Files:** Create `packages/translation/src/common.ts`, `rulesResources.ts`, `rulesResources.test.ts`, `assets.d.ts`; modify translation `index.ts`, `package.json`, `catalog.ts` only if shared merging needs extraction. Create `features/rules/useRulesResource.ts`, `useRulesResource.test.tsx`; modify `Rules.tsx`, `app/AppModals.tsx`, `pages/board/[gameId]/index.tsx`, `apps/ui/src/table/Table/{Table.tsx,types.ts}` and focused Table tests.

**Interfaces:** Translation package exports `loadRules(language: string): Promise<void>`; normalize supported regional languages to `en | ru`, with unsupported languages falling back to `en`. `useRulesResource(enabled: boolean)` returns `{ status: 'idle' | 'loading' | 'ready' | 'error'; error?: unknown; retry(): void }`, using the current resolved language. Add optional `TableSlots.rules?: ReactNode`; allow `TableCopyBundle.rules?: RulesCopy` while retaining existing rules rendering when supplied. Production board supplies the slot; playground keeps its existing copy path.

- [ ] **Step 1:** Add translation tests with a fresh i18next instance/fetch mock: common copy is available without rules requests; two concurrent Russian loads request each required language once; `en` fallback fills a missing Russian key; nested common `rules`/`rulesBlock` members survive merging; failed requests retry; static `catalog` still equals the full merged catalogs. Add hook tests for close during load and `ru → en` races: the visible content follows current language, not resolution order.

  ```ts
  await Promise.all([loadRules('ru-RU'), loadRules('ru')])
  expect(fetchMock).toHaveBeenCalledTimes(2) // selected ru asset and en fallback asset
  expect(i18n.t('start.createGame', { lng: 'ru' })).toBe(ruCommon.start.createGame)
  expect(i18n.t('rulesBlock', { lng: 'ru', returnObjects: true })).toEqual(ruFull.rulesBlock)
  ```

- [ ] **Step 2:** Run `pnpm --filter @release/translation test` and `pnpm --filter @release/web exec vitest run src/features/rules/useRulesResource.test.tsx`; expect new interfaces to fail.
- [ ] **Step 3:** Initialize i18n from `common.ts` rather than static `catalog.ts`. Import rules JSON as Vite `?url` assets in `rulesResources.ts` and fetch/validate JSON on demand; do not import their contents into the initial JS. Deduplicate by language and evict failed promises. Preserve deep merge with `addResourceBundle(..., 'common', ..., true, true)` and wait for selected-language plus English fallback data before ready. Declare `*.json?url` types in the translation package. Export `./catalog` in package metadata and place exact frontend translation subpath aliases before the bare alias wherever required; retain existing type-only augmentation.
- [ ] **Step 4:** Make modal Rules lazy and use the hook. Add Table rules slot with existing copy fallback; do not globally replace playground drawer warm-up behavior. Production slot receives `enabled={panel === 'rules'}` and latches its first activation so exit animations retain loaded content. Remove eager `t('rulesBlock')` construction from board; no rules fetch when table mounts or merely warms the rail. Keep UI i18n-agnostic.
- [ ] **Step 5:** Verify new slot versus legacy copy in a focused Table test, and run translation tests, rules hook tests, `pnpm --filter @release/ui test`, frontend/playground typecheck and builds. Confirm both language catalogs and playground's rules still work. Commit: `feat: load rules content on demand`.

## Task 6: Compose eager start and deferred file-based routes

**Files:** Create `app/buildRoutes.ts`, `buildRoutes.test.tsx`, `routeModules.ts`, `routes.tsx`; modify `app/main.tsx`, `pages/_app.tsx`, `app/lib/viewTransition.ts`, `features/start-game/useStartGame.ts`, `pages/lobby/[lobbyId].tsx`, routing/lifecycle tests and frontend `CLAUDE.md` routing description.

**Interfaces:** `PageModule` has the existing generouted exports `default`, `Catch?`, `Loader?`, `Action?`, `Pending?`, typed with React/Router types. `buildRoutes(eager: Record<string, PageModule>, deferred: Record<string, ModuleResource<PageModule>>, options: { requestSession(): Promise<void> }): RouteObject[]` uses public `generateRegularRoutes` from `@generouted/react-router/core` and preserves its nesting/index conventions. Pass `requestSession: () => sessionStore.request()` from `main.tsx`, using Task 4's same store. `routeModules.ts` exports one resource per glob key plus `preloadBoard(): Promise<void>`. `runViewTransition(update: () => void | Promise<void>): void` awaits the committed router navigation before the new snapshot.

- [ ] **Step 1:** Add tests for `/ → /start`, 404 redirect, eager start without any importer call, lazy help/lobby/board/stats, params, index semantics, root Catch, and existing exported loaders/actions. Use the actual builder in memory-router tests instead of a manually mirrored tree. Add a delayed import assertion: prior screen remains until destination is ready; a direct deep link shows a pending shell.

  ```ts
  expect(router.state.location.pathname).toBe('/start')
  expect(boardImporter).not.toHaveBeenCalled()
  const navigation = router.navigate('/board/g1') // leave its module promise pending
  expect(screen.getByTestId('start-screen')).toBeTruthy()
  resolveBoardModule()
  await navigation
  expect(screen.getByTestId('board-screen')).toBeTruthy()
  ```

- [ ] **Step 2:** Add failure tests: nested route loading errors leave the outer session owner mounted, retry calls that route resource again, and unknown render exceptions still reach the existing Catch. A reduced-motion transition awaits loading without calling `startViewTransition`; supported transitions run once and await navigation completion.
- [ ] **Step 3:** Run `pnpm --filter @release/web exec vitest run src/app/buildRoutes.test.tsx src/pages/__tests__/routing.test.tsx`; expect failure before composition exists.
- [ ] **Step 4:** Use two disjoint literal globs: eager `/src/pages/{index,start}.{jsx,tsx}` and lazy page/layout patterns matching generouted, excluding eager pages, 404, underscore dirs, tests/specs. Import root/404 explicitly. Build with public core; retain plugin for route types. No private dist imports, manual URL table, or generated-file edits. `routes.tsx` provides root layout/Catch and a nested boundary for load failures; session ownership remains outside the router. Use route `lazy` to await module resources before committing navigation; for lobby/board/stats await `requestSession()` in parallel with the page load so the destination is ready before replacing the current screen. Start/help do not activate it. Retry from a failed route performs a new navigation with `{ replace: true }` to the current location, including search/hash; resource rejection must not be memoized. Keep revalidation for exported data loaders separate from module retry. Preserve route exports. Add a root `HydrateFallback`/pending component using the installed Router API for direct navigation.
- [ ] **Step 5:** Call `preloadBoard()` once on entering a ready lobby. Catch preload failures without unhandled rejections; navigation later retries the failed resource. Do not mount board or fetch rules during preload. Pass the navigation promise into `runViewTransition` in game-start navigation and preserve existing fallback/reduced-motion semantics.
- [ ] **Step 6:** Rerun routing/lobby tests, frontend build at the deployment base, and generated route-type diff. Expect route behavior unchanged, no page test imported, and lazy board/stats assets emitted separately. Update the obsolete eager-routing description. Commit: `feat: split frontend screens by navigation`.

## Task 7: Isolate start styles and stable vendor chunks

**Files:** Create `apps/ui/src/start.ts`, `foundation.ts`, `apps/frontend/build/vendorChunks.ts`; modify UI package exports, frontend Vite/Vitest aliases, frontend/debug TypeScript mappings, and start/root/error/loading imports. Update playground configuration only for public subpaths it consumes.

**Interfaces:** `@release/ui/start` exports only start requirements: Menu/MenuButton/MenuGroup, VideoPlayer, HudBackground, PhysicalEdition, LangSwitcher. `@release/ui/foundation` exports Button, Typography, Modal, and ScrollArea. Entries import leaf modules rather than the root barrel. `vendorChunk(id: string): string | undefined` supplies Rollup `manualChunks` names based on exact normalized package boundaries, including pnpm paths.

- [ ] **Step 1:** Rebuild the report after Task 6 and run `assert-start.mjs`. Use retained module IDs/CSS to identify leaks from the UI barrel and root error/modal dependencies; the assertion must fail for those remaining leaks before changing entries.
- [ ] **Step 2:** Add the two narrow public UI entries and exact aliases before bare `@release/ui`; migrate the eager dependency closure to them. Preserve the existing root barrel for all old consumers. Do not globally change CSS side-effect flags. Resolve any internal barrel import reached by start to its existing leaf module, without changing visuals.
- [ ] **Step 3:** Use the report to configure these independent groups when the corresponding packages are present: `vendor-react` for react/react-dom/scheduler; `vendor-router` for react-router; `vendor-i18n` for i18next/react-i18next/language detector; `vendor-peer` for peerjs plus measured transport-only dependencies. Return undefined for application/workspace modules and unmatched packages. Do not sweep every node_modules package into one vendor. Check transitive closures: a vendor group shared by start must never import peer or board code. Retain `build.cssCodeSplit: true`.
- [ ] **Step 4:** Run `pnpm --filter @release/web build`, `pnpm --filter @release/playground build`, affected typechecks, then `node apps/frontend/perf/build-report.mjs --out /tmp/release-fe-split`. Expect no circular-chunk warnings and no duplicate React runtime. Run `assert-start.mjs` with a cold production request log; expect zero forbidden modules/styles/requests.
- [ ] **Step 5:** Confirm unchanged start screenshot/layout and language switch, modal controls, and board appearance against the recorded baseline/reference. Run UI and frontend tests. Commit: `perf: isolate start assets and stable dependencies`.

## Task 8: Prove loading, retry, session lifetime, and cache isolation

**Files:** Update `docs/performance/2026-10-19-frontend-loading.md`; keep raw browser traces/reports in a task evidence directory outside normal published assets. Add regression tests to the owning modules above only when this task reveals a defect.

- [ ] **Step 1:** Repeat Task 1's exact five-run cold measurements for `/` and `/start`, same versions/settings/server delivery. Record median FCP/LCP, JS execution time, JS/CSS transfer bytes, request count, and LCP element before/after. Keep common catalogs eager. Initial transfers and timings must improve; if timings regress or evidence is noisy, investigate and report the unresolved result before claiming the goal achieved.
- [ ] **Step 2:** Run browser create/join/rules with delayed responses, close/back before completion, language switch during rules load, direct invite/board/stats URLs, restored host and guest, lobby → board → stats → next match, and reduced motion. Measure first-action delays and confirm one session owner. Use a real DataChannel for the transport-lifetime claim; otherwise label the transport check unverified.
- [ ] **Step 3:** In the production browser, intercept one async JS request and one rules JSON request: fail the first, restore the server, press Retry, and verify a new request plus successful rendering. Also fail dependent CSS and a shared child chunk. Test a persistent 404 simulating an old deployment: keep the session alive, show explicit refresh, and assert zero automatic navigations/reloads. If the browser retains a native module failure, expose explicit refresh and record that limitation; never claim same-tab retry succeeded without a new successful request. If transient recovery required by the spec cannot be achieved, stop and revise that mechanism rather than replacing the runtime or adding a service worker.
- [ ] **Step 4:** Build A, make one reversible board-only copy/style change in isolation, then build B with identical env/toolchain. Restore the source change. Compare file content hashes, not timestamps: stable third-party groups and unrelated start resources must match; list changed entry references and total invalidated bytes. Inspect any unexpected shared-chunk churn and fix its boundary.
- [ ] **Step 5:** If the user-authorized deployment is available, inspect actual cache headers and verify warm-cache behavior across the two versions. Do not publish solely to obtain this evidence without authorization. Otherwise state hosted reuse is unverified and distinguish it from successful hash isolation.
- [ ] **Step 6:** Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm --filter @release/web build`, and `pnpm --filter @release/playground build`; verify `git diff --check` and no debug/temporary source modifications. Summarize results and remaining evidence limits in the performance report. Commit: `docs: record frontend loading and cache results`.

## Plan self-review and handoff

Spec coverage: Task 1 establishes baseline/graph evidence; Task 2 breaks persistence's engine dependency; Tasks 3–4 own loading/recovery/session lifetime; Task 5 owns translation/rules compatibility; Task 6 owns routing/preload/transitions; Task 7 owns CSS/vendor isolation; Task 8 proves end-to-end behavior and explicitly separates local versus hosted evidence. All five Review Focus conditions have an owning test or browser check.

No implementation is authorized by this document alone. Review the plan and select execution: native execution in this chat, or task-by-task implementation with separate subagents/reviewers. Native execution is recommended because the eight tasks share session, routing, and module-resource interfaces; use one independent whole-branch review at the end.

## Technical references

- [Generouted public core](https://github.com/oedotme/generouted) — confirm installed exports against local `@generouted/react-router` 1.20.2; do not assume the latest README describes a new API.
- [Vite 6 build and preload failures](https://v6.vite.dev/guide/build) — stale deployment chunks and `vite:preloadError`; automatic reload is not the selected session-safe policy.
- [Vite 6 CSS splitting/build options](https://v6.vite.dev/config/build-options) — use Rollup `manualChunks` for this frontend's installed Vite, not newer Rolldown configuration.
- [Dynamic import caching](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import) — resetting React/application promise state does not guarantee recovery from cached native module evaluation failures.
