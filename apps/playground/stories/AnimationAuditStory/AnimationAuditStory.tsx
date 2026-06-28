import { type ReactNode, useState } from 'react'
import styles from './AnimationAuditStory.module.css'

// АУДИТ АНИМАЦИЙ — источник состояния работы с анимациями (карта местности, не
// интерактив). Три таблицы:
//   1. Готовые модули — кирпичики для сборки (атомы анимаций), со статусами.
//   2. Сценарные комбинации — как кирпичики складываются под игровые ситуации.
//      Сценарий — это последовательность, а не модуль: его не оформляют отдельно,
//      поэтому тут БЕЗ статусов, только что уже реализовано.
//   3. Требует доработок — где криво, со статусами (доработать / есть готовое).
// Меняешь анимации — обнови эту страницу.

type Status = 'ok' | 'rework' | 'reuse'

const STATUS: Record<Status, { cls: string; label: string }> = {
  ok: { cls: styles.ok, label: 'оформлено' },
  rework: { cls: styles.rework, label: 'доработать' },
  reuse: { cls: styles.reuse, label: 'есть готовое' },
}

interface Module {
  mod: string
  what: string
  where: string
  status: Status
}
interface Scenario {
  name: string
  from: string
  where: string
}
interface Issue {
  what: string
  problem: string
  where: string
  status: Status
}

// ===== 1. Готовые модули — кирпичики =====
const MODULES: Module[] = [
  {
    mod: 'move()',
    what: 'Базовый travel: перелёт из rect в rect — translate по центрам + scale по ширине + финальные rotate/dx/dy. Основа всех полётов карт.',
    where: 'animations/presets.ts (внутр.)',
    status: 'ok',
  },
  {
    mod: "play('flipCard')",
    what: 'Переворот карты лицо↔рубашка (rotateY).',
    where: 'словарь → Card',
    status: 'ok',
  },
  {
    mod: "play('shake')",
    what: 'Тряска влево-вправо — фидбек «поле не заполнено». Разовый триггер по событию (как flipCard): затухающая амплитуда, возврат в исходную точку. Перезапускается на повторный вызов.',
    where: 'словарь → Invite, Start (модалка входа)',
    status: 'ok',
  },
  {
    mod: "play('playToCenter')",
    what: 'Выкладывание карты в центр стола (move, 480/ease).',
    where: 'словарь → CardPlay, DeckAnimations',
    status: 'ok',
  },
  {
    mod: "play('playToReleaseZone')",
    what: 'Карта в слот зоны релиза (move, 480, снап-приземление).',
    where: 'словарь → Combo',
    status: 'ok',
  },
  {
    mod: "play('centerToDiscard')",
    what: 'Из центра в сброс с разворотом и разбросом (move, 420).',
    where: 'словарь → CardPlay, Combo, DeckAnimations',
    status: 'ok',
  },
  {
    mod: "play('flyFrom')",
    what: 'FLIP-вылет: элемент уже на новом месте, анимируем его «из» прошлого rect в текущую позицию. Появление новой колоды/карты из источника.',
    where: 'словарь → DeckAnimations, Animations',
    status: 'ok',
  },
  {
    mod: "play('gatherToDeck')",
    what: 'Стопка летит к целевой стопке и приземляется (сброс → новая колода). move, центр-в-центр.',
    where: 'словарь → DeckAnimations',
    status: 'ok',
  },
  {
    mod: "play('absorbToDeck')",
    what: 'Поглощение: стопка/колода летит в целевую и растворяется по ходу (слияние колод). move + fade.',
    where: 'словарь → DeckAnimations',
    status: 'ok',
  },
  {
    mod: "play('drawToCenter')",
    what: 'Карта выходит из колоды добора в центр стола. Отдельно от playToCenter — у добора своя вариативность (число карт, спец-механики).',
    where: 'словарь → DrawCard',
    status: 'ok',
  },
  {
    mod: "play('dealToSeat')",
    what: 'Карта из центра уходит к месту игрока и растворяется в скрытой руке (move + fade).',
    where: 'словарь → DrawCard',
    status: 'ok',
  },
  {
    mod: "play('returnToDeck')",
    what: 'Карта возвращается из центра обратно в колоду (центр→колода) с уменьшением до размера колоды. Парный к drawToCenter.',
    where: 'словарь → DrawCard',
    status: 'ok',
  },
  {
    mod: 'useArrow() + centerOf()',
    what: 'Геометрия адресной стрелки: точки from/to, слежение за курсором, старт/стоп.',
    where: 'primitives/Arrow → Arrow, Combo, DeckAnimations',
    status: 'ok',
  },
  {
    mod: 'CardPair',
    what: 'Визуальный атом пары: вспомогательная карта подтыкается под основную под углом.',
    where: 'primitives/CardPair → Combo, DeckAnimations',
    status: 'ok',
  },
  {
    mod: 'EdgeGlow',
    what: 'Краевое свечение контейнера внутрь (инсет-вуаль) с плавным fade появления/затухания (CSS-transition). Два варианта силы: strong (стол игрока) / weak (место соперника). Цвет/интенсивность — пропсами.',
    where: 'primitives/EdgeGlow → DrawCard (тревога Error 503), UI KIT',
    status: 'ok',
  },
  {
    mod: 'jitter()',
    what: 'Разброс карты в сбросе (угол ±14°, смещение ±10/±8). Пара к centerToDiscard.',
    where: 'animations/scatter → Combo, CardPlay, DeckAnimations',
    status: 'ok',
  },
  {
    mod: 'nextFrames()',
    what: 'Двойной requestAnimationFrame — дождаться отрисовки нового узла перед стартом анимации.',
    where: 'animations/timing → Combo, CardPlay, DeckAnimations, DrawCard',
    status: 'ok',
  },
  {
    mod: 'wait(ms)',
    what: 'Пауза-таймер для держания фаз между анимациями.',
    where: 'animations/timing → Combo, CardPlay, DeckAnimations, DrawCard, Animations',
    status: 'ok',
  },
  {
    mod: 'slotPlacement() / handStep()',
    what: 'Единый источник геометрии веера руки: наклон, дуга, ширина и шаг-от-кол-ва карт. Раскладка слотов в Hand и приземление вставки считаются по ОДНОЙ формуле — без копий, которые разъезжаются при тюнинге.',
    where: 'table/Hand/fan → Hand, useHandInsert',
    status: 'ok',
  },
  {
    mod: 'useHandInsert()',
    what: 'Карта «встаёт в руку»: рука раздвигает зазор, карта подгоняет размер и садится в bottom-center слота. Место слота берёт из table/Hand/fan (slotPlacement).',
    where: 'stories/interactive → DrawCard, CardToHand, PickOpponentCard',
    status: 'ok',
  },
]

// ===== 2. Сценарные комбинации — последовательности под ситуации (без статусов) =====
// Средняя колонка — техническая: модули + ключевые моменты реализации
// (rect-замеры, FLIP, порядок в DOM, key-remount, фиксы), а не общий пересказ.
const SCENARIOS: Scenario[] = [
  {
    name: 'Розыгрыш карты',
    from: 'flyer (fixed) от rect карты → playToCenter (move 480, EASE) по центрам; wait — удержание; nextFrames перед стартом, чтобы новый узел успел отрисоваться; затем centerToDiscard (move 420) + jitter() на финальные rotate/dx/dy разброса.',
    where: 'CardPlay, DeckAnimations',
  },
  {
    name: 'Розыгрыш комбо (пара)',
    from: 'useArrow + centerOf ведёт прицел; совмещение через CardPair (доп. карта подтыкается под углом); релиз → playToReleaseZone (move 480, SNAP-приземление); в сброс — пара распадается на 2 одиночки, каждой свой centerToDiscard + jitter().',
    where: 'Combo',
  },
  {
    name: 'Адресная атака стрелкой',
    from: 'useArrow строит from/to по centerOf карты и цели, слежение за курсором (mousemove), старт/стоп по фазе розыгрыша.',
    where: 'Arrow, Combo',
  },
  {
    name: 'Разделение колоды',
    from: 'FLIP-вылет flyFrom: половина уже в новом DOM-месте, анимируем «из» прошлого rect (getBoundingClientRect до→после ремаунта) в текущую позицию.',
    where: 'DeckAnimations',
  },
  {
    name: 'Слияние колод (+ сброс)',
    from: 'все стопки и сброс — параллельные absorbToDeck (move + fade) в один rect первой колоды; цель измеряется однажды, расходятся только источники.',
    where: 'DeckAnimations',
  },
  {
    name: 'Сброс → новая колода',
    from: 'собрать разбросанный сброс в стопку → gatherToDeck (move, центр-в-центр) к месту колоды → flipCard рубашкой вверх по приземлении.',
    where: 'DeckAnimations',
  },
  {
    name: 'Добор карты (одиночный)',
    from: 'drawToCenter (move 480) колода→центр рубашкой вверх; ветвление по карте: игрок — flipCard + useHandInsert.insert (садится в слот руки); соперник — dealToSeat (move + fade) в card-area места ×0.7, без скейла вверх; триггер/AI — flipCard в центре (reveal для всех), AI ещё добирает эффект из AI-колоды рядом (flyer с key={seq}, чтобы Card не переиспользовалась и не крутилась).',
    where: 'DrawCard',
  },
  {
    name: 'Мультидобор (по кнопке)',
    from: 'батч из N карт (N = число колод) гонит тот же одиночный сценарий через drawOne → boolean; на неразрешённом триггере (Error 503) drawOne возвращает false и серия рвётся — ждёт ручного разбора карты (фикс-сценариев под триггеры нет).',
    where: 'DrawCard',
  },
  {
    name: 'Разрешение AI (уход карт)',
    from: 'resolveAi(trig, eff) — карты приходят аргументами, не из стейта (фикс stale-closure на клике); wait (имитация логики) → параллельно: триггер centerToDiscard + jitter() в сброс; эффект flipCard рубашкой на месте со стаггером → returnToDeck (move) в AI-колоду с уменьшением до её размера.',
    where: 'DrawCard',
  },
  {
    name: 'Тревога Error 503 (краевое свечение)',
    from: 'EdgeGlow внутри контейнера зоны стола (.glowBounds от измеренной высоты тех-бара — край экрана ≠ край стола); своя вытяжка — strong ДО Hand в DOM (ПОД рукой); соперник — weak ПОСЛЕ Hand (НАД рукой) + pointer-events:none, чтобы не глушить ховер-реакцию руки; появление/затухание — CSS-transition opacity.',
    where: 'DrawCard',
  },
  {
    name: 'Взятие карты соперника',
    from: 'раздача-грид карт рубашкой → flipCard reveal выбранной → useHandInsert (зазор в руке + посадка в bottom-center слота по slotPlacement).',
    where: 'PickOpponentCard',
  },
]

// ===== 3. Требует доработок =====
// Пусто: всё свелось к модулям. (Совмещение в пару в Combo осознанно оставлено
// как есть — это съезд карт в стопку, а не rect→rect перелёт; гнать через move()
// было бы лишним усложнением, не проблемой.)
const ISSUES: Issue[] = []

function Badge({ status }: { status: Status }) {
  const s = STATUS[status]
  return <span className={`${styles.badge} ${s.cls}`}>{s.label}</span>
}

// микро-кнопка «копировать имя модуля» — проявляется на ховере строки
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1100)
    })
  }
  return (
    <button
      type="button"
      className={styles.copyBtn}
      onClick={copy}
      aria-label={`копировать ${text}`}
      title="копировать"
    >
      {copied ? '✓' : '❐'}
    </button>
  )
}

function LegendItem({ status, children }: { status: Status; children: ReactNode }) {
  return (
    <span className={styles.legendItem}>
      <Badge status={status} />
      {children}
    </span>
  )
}

function ModuleTable({ rows }: { rows: Module[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>модуль</th>
          <th>что делает</th>
          <th>где живёт · используется</th>
          <th>статус</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.mod}>
            <td className={styles.mod}>
              <span className={styles.modCell}>
                <span>{r.mod}</span>
                <CopyButton text={r.mod} />
              </span>
            </td>
            <td className={styles.what}>{r.what}</td>
            <td className={styles.where}>{r.where}</td>
            <td>
              <Badge status={r.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ScenarioTable({ rows }: { rows: Scenario[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>сценарий</th>
          <th>реализация · модули и ключевые моменты</th>
          <th>где</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td className={styles.mod}>{r.name}</td>
            <td className={styles.what}>{r.from}</td>
            <td className={styles.where}>{r.where}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function IssueTable({ rows }: { rows: Issue[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>что</th>
          <th>проблема</th>
          <th>где</th>
          <th>статус</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.what}>
            <td className={styles.mod}>{r.what}</td>
            <td className={styles.what}>{r.problem}</td>
            <td className={styles.where}>{r.where}</td>
            <td>
              <Badge status={r.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function AnimationAuditStory() {
  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Аудит анимаций</h1>
      <p className={styles.intro}>
        Источник состояния работы с анимациями. Сначала готовые <b>модули</b> — кирпичики для
        сборки. Затем <b>сценарные комбинации</b> — как кирпичики складываются под игровые ситуации
        (сценарий — это последовательность, а не модуль: его не оформляют отдельно, поэтому без
        статусов). И в конце — раздел <b>что требует доработок</b> (сейчас пусто: всё свелось к
        модулям).
      </p>

      <div className={styles.legend}>
        <LegendItem status="ok">оформлено модулем, переиспользуется</LegendItem>
        <LegendItem status="rework">код есть, но кривой/дублируется — доработать</LegendItem>
        <LegendItem status="reuse">есть готовый модуль, но не используется — применить</LegendItem>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Готовые модули</h2>
        <p className={styles.sectionNote}>Самодостаточные кирпичики — один смысл, одна задача.</p>
        <ModuleTable rows={MODULES} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Сценарные комбинации</h2>
        <p className={styles.sectionNote}>
          Реализованные последовательности из модулей выше — под конкретные ситуации игры.
        </p>
        <ScenarioTable rows={SCENARIOS} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Требует доработок</h2>
        {ISSUES.length > 0 ? (
          <IssueTable rows={ISSUES} />
        ) : (
          <p className={styles.sectionNote}>Открытых проблем нет — всё свелось к модулям.</p>
        )}
      </section>
    </div>
  )
}
