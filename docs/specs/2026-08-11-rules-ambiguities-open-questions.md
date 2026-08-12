# Rules ambiguities — open questions

**TODO: these are unanswered.**

Every question here is a place where [`docs/rules-board-game.md`](../rules/rules-board-game.md) leaves room and the engine chose for it, by accident of implementation rather than by decision. Answering **"keep current behaviour"** is a perfectly good answer — the point is that it stops being an accident.

Covers [#76](https://github.com/MythHand/ReleaseBoardGameP2P/issues/76) (questions 1–8) and [#74](https://github.com/MythHand/ReleaseBoardGameP2P/issues/74) (questions 9–11).

Each question carries a recommendation. **"Agree with the recommendation" is a full answer.**

Question **7** is marked **technical** — it is about how the engine is built rather than about the rules, and needs no answer from the rules owner.

> **The rules file is stale.** Answer 1 of [`2026-08-02-git-operations-rules-decisions.md`](./2026-08-02-git-operations-rules-decisions.md) records that the rules were revised after `docs/rules-board-game.md` was written, and that file has not changed since. Line references below point at it anyway, because it is the only written text there is — but if a quotation looks wrong, the file is the likely culprit, not the question.

## DDoS

- [ ] **1. Can DDoS be answered by a defence card?**

  Hotfix, Rubber Ducky and PR Approved name their targets and exclude DDoS ([rules :110](../rules/rules-board-game.md)). Rollback ([:114](../rules/rules-board-game.md)), Not a Bug ([:118](../rules/rules-board-game.md)) and Works on my Machine ([:122](../rules/rules-board-game.md)) all read "Отменяет атаку" with no card list — so they either cover DDoS or they do not, and the text does not say which.

  Today DDoS resolves the instant it is played and nobody may answer it ([`release.ts:189`](../../packages/engine/src/fake/release.ts)).

  **Recommendation: keep it unanswerable.** DDoS does not destroy — it bounces a release to hand or kills a Monitoring — so it is the mildest attack in the game, and the three open-worded defences are the scarcest cards. Letting them cancel it spends the game's best answers on its smallest threat.

- [ ] **2. Can DDoS be thrown at a freshly played Code Review-protected release?**

  "DDoS — единственная атака, работающая против защищённого релиза" ([:59](../rules/rules-board-game.md)). Code Review can only ever be attached as the release is played, so that sentence reads like it is about the moment of play.

  Today it cannot happen at all: a protected release opens no reaction window, and DDoS is playable only on your own turn. A protected release can never be answered in the moment — which makes ":59" true of no situation the engine can reach.

  **Recommendation: open the window for a protected release, with DDoS the only card that may enter it.** That is the one reading under which the sentence describes something. The alternative — that it only means "on a later turn you may DDoS it" — is already covered by ordinary play and would make the sentence redundant.

## Security Bug

- [ ] **3. Which release does Security Bug need you to have before the stolen one is discarded instead?**

  "если у вас выложен Release в зоне релиза, атакованный Release отправляется в сброс" ([:100](../rules/rules-board-game.md)) reads as *any* release. The engine reads it as *that same slot* ([`attacks.ts:43`](../../packages/engine/src/fake/attacks.ts)): the steal happens unless the thief's matching slot is already occupied.

  **Recommendation: the engine's reading — that same slot.** Read literally, a player with one release could never steal again, which makes the card nearly dead for whoever is ahead. Per-slot keeps it live and matches the zone being keyed by type.

- [ ] **4. Is a failed Security Bug request public?**

  The rules are silent. The engine tells everyone the request missed ([`handAttacks.ts`](../../packages/engine/src/fake/handAttacks.ts)).

  **Recommendation: keep it public.** A private miss turns the card into a probe you can repeat until it lands, and the table loses the read on who was caught holding what.

## Monitoring and elimination

- [ ] **5. Is Monitoring's protection automatic, or one option among several?**

  "угроза от них игнорируется" ([:86](../rules/rules-board-game.md)) reads automatic. The engine offers it as one neutralize method beside Debugger and sacrifice ([`triggers.ts:19`](../../packages/engine/src/fake/triggers.ts)), so a player holding both Monitoring and a Debugger can be prompted into spending the Debugger.

  **Recommendation: automatic.** "Игнорируется" describes something that happens to the threat, not a choice offered to the player, and nobody would knowingly pick the costly option when the free one is on the table.

- [ ] **6. Where do an eliminated player's cards go?**

  The rules say nothing ([:177](../rules/rules-board-game.md)). The engine sends hand and zone to the discard.

  **Recommendation: keep the discard.** They have to go somewhere, and the discard is the only public pile — which also keeps them reachable by the cards that reach into it.

- [ ] **7. Who starts?** *(technical — no rules answer needed)*

  The rules give a social rule ([:20](../rules/rules-board-game.md)); the engine seats the host first. Recorded only so the difference is written down somewhere.

- [ ] **8. Does a release placed by an AI Release event use up the one-release-per-turn allowance?**

  Unstated. The engine says no — `releasesPlayed` is incremented only when a player ships one themselves ([`release.ts:52`](../../packages/engine/src/fake/release.ts)).

  **Recommendation: keep it free.** The allowance limits what a player chooses to do; an AI event is something done to them, and charging them for it would make a lucky draw cost a turn's play.

## Works on my Machine

The reflection branch turns an attack back on whoever threw it. "Эффект карты атаки оборачивается против самого атакующего" ([:122](../rules/rules-board-game.md)) — three things follow from "эффект" that the engine currently decides on its own.

- [ ] **9. Does a reflected attack get through Code Review?**

  Code Review makes a release invulnerable to Bug, Out of Memory, Legacy Code and Security Bug, "даже с sudo-усилением" ([:132](../rules/rules-board-game.md)). The engine's reflection picks the attacker's first occupied slot without checking for protection, and the Code Review attached to it is discarded along with the release.

  **Recommendation: no — a reflected attack is still that attack, so protection holds.** Otherwise Works on my Machine is a way to launder any attack past a Code Review, which is a stronger effect than either card claims.

- [ ] **10. A reflected Security Bug — does the reflector take the release, or is it destroyed?**

  Security Bug's own effect is "забираете карту релиза в свою зону релиза" ([:100](../rules/rules-board-game.md)). Reflected, the engine destroys the attacker's release rather than moving it.

  **Recommendation: the reflector takes it.** The card reflects the *effect*, and taking is the effect. Destroying is a different card's effect, applied because the reflection path passes no thief.

- [ ] **11. Which of the attacker's releases does a reflected attack hit?**

  The rules do not say. The engine takes the first occupied slot in a fixed order — always Frontend if there is one — which is array order, not a decision.

  **Recommendation: the reflector picks.** The reflection is their card and their moment, and the attacker already chose their target; a fixed order silently makes Frontend the most dangerous release to own.

  If picking is unwanted, any stated rule will do — "the attacker chooses", "the same slot as the original target" — but it needs to be stated, because it is currently an accident.
