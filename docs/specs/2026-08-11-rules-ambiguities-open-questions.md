# Rules ambiguities — open questions

**TODO: three of these are unanswered.**

This file asked eleven questions. [`docs/rules/`](../rules/) — the written spec [#91](https://github.com/MythHand/ReleaseBoardGameP2P/pull/91) landed — answered eight of them, and those are recorded below with where the answer lives rather than deleted, so nobody re-asks them. Two of the eight have since been **superseded** by a refinement from the rules owner — see below.

Three are still open, and one is a divergence noted for the record.

**The live pool is the [comment on #92](https://github.com/MythHand/ReleaseBoardGameP2P/pull/92#issuecomment-5277857784)**, asked fresh rather than as this list with parts crossed out. This file stays as the record of what was asked and what came back.

Each open question carries a recommendation. **"Agree with the recommendation" is a full answer**, and so is **"keep current behaviour"** — the point is that the engine stops deciding by accident.

## Still open

- [ ] **1. Can DDoS be answered by a defence card?**

  [`resolution.md` §2](../rules/resolution.md) gives the attack → defence chain and what each answer takes, and [§5](../rules/resolution.md) makes DDoS "отдельная ветка" — no fresh-release restriction, stopped by neither Code Review nor Monitoring. Neither says whether a Cancel or a Unicorn can answer one.

  Today DDoS resolves the instant it is played and nobody may answer it ([`release.ts`](../../packages/engine/src/fake/release.ts)).

  **Recommendation: keep it unanswerable.** DDoS does not destroy — it returns a release to hand and freezes it — so it is the mildest attack in the game, and the open-worded defences are the scarcest cards. Letting them cancel it spends the game's best answers on its smallest threat.

- [ ] **2. Is a failed Security Bug request public?**

  [`cards.md`](../rules/cards.md) says what happens — "нет — не происходит ничего, а карта атаки сбрасывается" — but not whether the table is told. The engine broadcasts the miss to everyone ([`handAttacks.ts`](../../packages/engine/src/fake/handAttacks.ts)).

  **Recommendation: keep it public.** A private miss turns the card into a probe you can repeat until it lands, and the table loses the read on who was caught holding what.

- [ ] **3. Does a release placed by an AI Release event use up the one-release-per-turn allowance?**

  [`modes.md`](../rules/modes.md) defines Base as "не более одного релиза за ход". An `ai-release-*` release is placed by an event rather than played from hand, and the axis does not say which of those it counts.

  The engine says it is free — `releasesPlayed` rises only when a player ships one themselves ([`release.ts`](../../packages/engine/src/fake/release.ts)).

  **Recommendation: keep it free.** The allowance limits what a player chooses to do; an AI event is something done to them, and charging for it would make a lucky draw cost a turn's play.

## Answered by the spec

Kept so the questions are not asked again. Nothing here needs a reply.

| # | Question | Where it is answered | Engine |
|---|---|---|---|
| 4 | DDoS against a freshly played Code Review release | [`resolution.md` §1, §5](../rules/resolution.md) — a protected release gives no attack time at all, and DDoS is not bound to freshness | correct |
| 5 | Which release Security Bug needs before the stolen one is discarded | [`cards.md`](../rules/cards.md) — a Release **of the same type** | correct |
| 6 | Is Monitoring's protection automatic or a choice | [`resolution.md` §7](../rules/resolution.md) — "порядок способов не задан, выбор за игроком" | correct; the recommendation here was **wrong** |
| 7 | Where an eliminated player's cards go | [`resolution.md` §7](../rules/resolution.md) — hand and zone to the discard, events-deck cards home | correct as of [#93](https://github.com/MythHand/ReleaseBoardGameP2P/issues/93) |
| 8 | Does a reflected attack get through Code Review | [`resolution.md` §4](../rules/resolution.md) — a protected release is taken only by DDoS, "даже с sudo" | fixed in [#74](https://github.com/MythHand/ReleaseBoardGameP2P/issues/74) |
| 9 | A reflected Security Bug — taken or destroyed | **superseded** — see below | it always discards |
| 10 | Which of the attacker's releases a reflected attack hits | **superseded** — see below | the attacked type, not a choice |

## Superseded — the spec text has not caught up yet

Rows 9 and 10 above were answered from `resolution.md`, and the rules owner has since
[refined the ruling](https://github.com/MythHand/ReleaseBoardGameP2P/pull/92#issuecomment-5265618826):
the wording those rows quote was the harder of two readings, and the **mirror** reading is the one
the card supports without an added rule.

- **A reflected Security Bug can never take a release — it always discards.** The reflected "take
  into your zone" aims at the defender's slot of the attacked type, and that slot is always occupied
  by the very release being defended, which never left because the attack was cancelled.
- **There is no slot to choose.** The effect returns at the attacker's release of *exactly the type
  that was attacked*. It lands only if they hold that type and it is not under Code Review;
  otherwise the attack is still cancelled and the second effect finds nothing — which is not the
  same as not firing.

Row 8 stands: Code Review still holds against a reflected attack.

Implemented in [#94](https://github.com/MythHand/ReleaseBoardGameP2P/pull/94). The spec text in
`cards.md` §184 and `resolution.md` §90/§139/§140/§142 still carries the old reading; the rules owner
is rewriting those on a branch off #91, so the divergence is tracked in
[`docs/rules/backlog.md`](../rules/backlog.md) rather than patched from here.

## Noted, not asked

**Who starts.** The rules keep a social rule — "первым ходит тот, кто последним релизил на прод" ([`general.md` §3](../rules/general.md)) — and the engine seats the host first. A divergence by necessity rather than a question; recorded so it is written down somewhere.
