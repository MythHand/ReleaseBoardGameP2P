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

### Модуль, не записанный НИГДЕ, не виден ни одной проверке

**Что не хватает.** Три вещи обязаны доезжать до доки, и все три теперь проверяются машиной:
пресет без строки в `reference.md` роняет `apps/ui/src/animations/docs.test.ts`; модуль, который
есть на странице аудита, но не упомянут в `reference.md`, роняет `apps/playground/stories/docs.test.ts`;
сцена из групп «Карты» и «Интерактив» без «живой ссылки» в `recipes.md` роняет его же. Но все три
сверяют **две точки друг с другом** — значит модуль, не дошедший ни до одной, невидим для всех
сразу.

**Чем грозит.** Ровно этим и кончилось для экранного выключателя параллакса
(`CardMotionProvider`): написан, работает в настройках стола, не значился ни на странице аудита, ни
в доках — и не значился бы дальше, потому что искать его было нечему. Опаснее обычной дыры тем, что
тесты при этом зелёные: возникает ложное чувство покрытия.

**Что закроет.** Автоматически — ничего разумного: отличить модуль от вспомогательной функции может
только человек, а перечня «всех модулей анимаций» не существует иначе как в голове. Реально
закрывает дисциплина на входе: модуль считается сделанным, когда он появился **на странице
аудита**, — оттуда его дотянет тест. Это правило, а не проверка.

**Статус.** `открыто`, признаётся как предел метода.

---

### `placed` — это не «карта сыграна в центр»

**Что не хватает.** Рецепт «Playing a card» и задача #96 называют парой `placed` → `discarded`
движение «из руки в центр и дальше в сброс». У события `placed` два производителя —
`fake/release.ts:177` и `fake/triggers.ts:298` — и оба кладут **Monitoring в зону релиза**, где
карта и остаётся. Центра стола в `PlayerView` нет вовсе: `decks` несёт `piles` / `events` /
`discardTop` / `discardCount` и ничего больше.

**Чем грозит.** Хореография, написанная под несуществующую последовательность. #96 успел поймать
это до кода — следующая задача может не успеть и получить сцену, которая никогда не проигрывается,
без единой ошибки в консоли.

**Что закроет.** Решение о том, ЧТО показывает центр стола в живой партии. Сыгранная атака, пока
открыто окно защиты, — самый вероятный кандидат, но это решение, а не работа: пока оно не принято,
у такта «карта ушла из центра» нет триггера (см. следующую запись). До тех пор рецепт исправлен так,
чтобы называть события, которые движок действительно шлёт.

**Статус.** `открыто`.

### Потраченные атака и защита уходят в сброс молча

**Что не хватает.** `fake/attacks.ts` отправляет потраченные карты в сброс через `bankToDiscard` —
прямой записью в `decks.discard`. Причины `attackSpent` и `defenceSpent` объявлены в
`DiscardReason` (`events.ts:61`) и **не отправляются никогда**. Лента событий описывает сброс
не полностью.

**Чем грозит.** Всё, что выводится из ленты, отстаёт от `discardCount`. Куча сброса на борде
собирается именно из ленты (`toBoardState.toDiscardHeap`), а `Pile` перестаёт показывать
`topCard`, как только куча непуста (`Pile.tsx:106`), — без обхода игрок видел бы верхом сброса
устаревшую карту.

**Что закроет.** Движок шлёт `discarded` с уже объявленными причинами при банковании. Это правка в
`packages/engine`, не в анимациях.

**Статус.** `времянка` — если верх кучи не совпал с `discardTop` проекции, настоящий верх
дописывается в кучу отдельной картой со скаттером по отрицательному ключу (`scatterAt(-1 - count)`,
вне диапазона id событий, чтобы подставная карта не унаследовала позу настоящей). Счётчик при этом
остаётся проекционным, то есть число верное всегда; врёт только глубина кучи.

### Что делает такт, если цели уже нет

**Что не хватает.** Карта, которую более позднее событие того же батча убрало с доски, — правила
для неё нет. Такт не может её измерить: слота, из которого она летит, на экране уже не существует.

**Чем грозит.** Любой локальный ответ станет правилом: по нему напишут код, его закрепит тест, и
следующая сцена будет сверяться с ним как с решённым.

**Что закроет.** Решение, а не выдумка. До него `planBeats` просто не строит полёт для карты без
источника — ровно как для события, у которого хореографии нет вообще. Это самый узкий из возможных
вариантов: анимации нет, исход прежний (карта в сбросе по проекции). Ни запасного источника, ни
угаданного прямоугольника, ни предупреждения в консоли, которое выглядело бы как принятое решение.

**Статус.** `открыто`.
