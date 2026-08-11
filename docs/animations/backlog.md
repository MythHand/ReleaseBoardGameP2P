# Backlog — gaps, disputes and stopgaps

The place where what is **missing, disputed or temporarily patched** is written down instead of
being quietly worked around. The other four files describe what exists and is verified; this one is
the only place allowed to describe what does not.

**The rule this file exists for.** When you hit a gap while working on an animation — no module for
a movement you need, a value you cannot reach, a rule nobody has decided — you do **not** invent a
local solution and move on. That is exactly how a movement ends up written three times in three
scenes. You either raise it and get a decision, or you write the stopgap down here, in the open,
with what it costs.

A gap that is not written down is indistinguishable from a gap nobody noticed. This file is what
turns "I ran into something" into a thing that can be scheduled.

**Two places, one finding, and that is on purpose.** The visible register is the playground
**`Interaction audit`** page (its "Требует доработок" section) — that is where the work is looked at,
so that is where a finding has to show up, in one line with a status. This file is the same finding
in full: what it costs and what would close it. Enter it in both — the page so it is seen, here so
it can be acted on.

## How to write an entry

```
### Title — what is missing, in one line
**Что не хватает.** The gap itself, concretely: file, value, movement.
**Чем грозит.** What it actually costs — a copy that will drift, a rewrite from scratch, a bug
that already happened. No vague "not clean".
**Что закроет.** The smallest thing that ends it, with the shape it should take. A recommendation,
not a plan.
**Статус.** `открыто` · `времянка` (a stopgap is in place — say what it is) · `решено` (then move
the description into the docs and delete the entry).
```

Statuses are for reading, not for bookkeeping: a `решено` entry does not stay here as a trophy — its
content moves into `reference.md` / `glossary.md` / `recipes.md` and the entry goes.

---

### У рецептов нет машинной проверки

**Что не хватает.** Пресеты проверяются тестом (`apps/ui/src/animations/docs.test.ts`): нет строки
в `reference.md` — падает CI. У рецептов такого признака нет: новая сцена в плейграунде ничем не
обязана оставить след в `recipes.md`.

**Чем грозит.** Ровно тем, что уже случилось со словарём: дока тихо отстала на семь пресетов, и это
вскрылось только при сплошной сверке. Со сценами будет так же, только заметнее — рецепт это
единственное, что переносит хореографию в игровой слой.

**Что закроет.** Честного признака нет: сцена — это файл истории, а не запись в реестре. Ближайшее
рабочее — список сцен в самой доке, сверяемый с навигацией плейграунда. Пока держится на
дисциплине, и это записано в `recipes.md` открытым текстом.

**Статус.** `открыто`, но осознанно **не в работе**: цена появится, когда рецептами начнут
пользоваться снаружи плейграунда. До тех пор запись живёт, чтобы это не выглядело недосмотром.
