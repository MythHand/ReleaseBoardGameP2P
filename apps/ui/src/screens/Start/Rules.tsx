import {
  Fragment,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { CARDS } from '@/cards'
import styles from './Rules.module.css'

// Правила = скелет (структура, язык-независимая) + copy (тексты по id, на язык).
// Имена карт в скелете общие для всех языков (они же ключи арта в каталоге).
// Перевод нового языка = новый RULES_COPY_*, структуру трогать не нужно.

// ── собранная форма (то, что рендерит компонент) ──────────────────────────
export interface RuleCard {
  names: string[]
  desc?: string
  lead?: string
  body?: string[]
  outro?: string
}

export interface RuleGroup {
  title?: string
  lead?: string
  body?: string[]
  cards?: RuleCard[]
  table?: boolean
  outro?: string
}

export interface RulesSection {
  title: string
  groupStart?: boolean
  lead?: string
  body?: string[]
  groups?: RuleGroup[]
  outro?: string
}

// ── скелет (без текста) ───────────────────────────────────────────────────
interface CardSkel {
  id: string
  names: string[]
}
interface GroupSkel {
  id: string
  table?: boolean
  cards?: CardSkel[]
}
interface SectionSkel {
  id: string
  groupStart?: boolean
  groups?: GroupSkel[]
}

const RULES: SectionSkel[] = [
  { id: 'objective' },
  { id: 'setup' },
  {
    id: 'turn',
    groups: [{ id: 'turn.play' }, { id: 'turn.draw' }, { id: 'turn.end' }],
  },
  { id: 'end' },
  {
    id: 'mechanics',
    groups: [
      { id: 'mech.release' },
      { id: 'mech.attack' },
      { id: 'mech.trigger' },
      { id: 'mech.events' },
    ],
  },
  {
    id: 'cards',
    groupStart: true,
    groups: [
      {
        id: 'cards.release',
        cards: [{ id: 'c.release', names: ['Frontend', 'Backend', 'Database'] }],
      },
      {
        id: 'cards.defense',
        cards: [
          { id: 'c.debugger', names: ['Debugger'] },
          { id: 'c.monitoring', names: ['Monitoring'] },
          { id: 'c.aimon', names: ['AI Monitoring'] },
        ],
      },
      {
        id: 'cards.attack',
        cards: [
          { id: 'c.bug', names: ['Bug', 'Out of Memory', 'Legacy Code'] },
          { id: 'c.secbug', names: ['Security Bug'] },
          { id: 'c.ddos', names: ['DDoS'] },
        ],
      },
      {
        id: 'cards.cancel',
        cards: [
          { id: 'c.hotfix', names: ['Hotfix', 'Rubber Ducky', 'PR Approved'] },
          { id: 'c.rollback', names: ['Rollback'] },
          { id: 'c.notabug', names: ['Not a Bug'] },
          { id: 'c.wom', names: ['Works on my Machine'] },
        ],
      },
      {
        id: 'cards.support',
        cards: [
          { id: 'c.sudo', names: ['Sudo'] },
          { id: 'c.codereview', names: ['Code Review'] },
        ],
      },
      {
        id: 'cards.git',
        cards: [
          { id: 'c.gitbranch', names: ['Git Branch'] },
          { id: 'c.gitmerge', names: ['Git Merge'] },
          { id: 'c.gitrebase', names: ['Git Rebase'] },
          { id: 'c.gitcherry', names: ['Git Cherry-pick'] },
          { id: 'c.sysupgrade', names: ['System Upgrade'] },
        ],
      },
      {
        id: 'cards.trigger',
        cards: [
          { id: 'c.error503', names: ['Error 503'] },
          { id: 'c.ai', names: ['AI'] },
        ],
      },
      {
        id: 'cards.ai',
        cards: [
          { id: 'ai.mon', names: ['AI Monitoring'] },
          { id: 'ai.crush', names: ['Crush Frontend', 'Crush Backend', 'Crush Database'] },
          { id: 'ai.release', names: ['Release Frontend', 'Release Backend', 'Release Database'] },
          { id: 'ai.inside', names: ['Inside'] },
          { id: 'ai.goodvibe', names: ['Good Vibe-Coding'] },
          { id: 'ai.badvibe', names: ['Bad Vibe-Coding'] },
          { id: 'ai.hallucination', names: ['Hallucination'] },
          { id: 'ai.error503', names: ['Error 503'] },
        ],
      },
    ],
  },
  {
    id: 'modes',
    groupStart: true,
    groups: [
      {
        id: 'mode.hand',
        table: true,
        cards: [
          { id: 'mode.hand.base', names: ['Base'] },
          { id: 'mode.hand.8bit', names: ['8 bit'] },
          { id: 'mode.hand.mem', names: ['Memory Problem'] },
        ],
      },
      {
        id: 'mode.rel',
        table: true,
        cards: [
          { id: 'mode.rel.base', names: ['Base'] },
          { id: 'mode.rel.fast', names: ['Fast Release'] },
        ],
      },
      {
        id: 'mode.cond',
        table: true,
        cards: [
          { id: 'mode.cond.base', names: ['Base'] },
          { id: 'mode.cond.easy', names: ['Easy Release'] },
        ],
      },
      {
        id: 'mode.ai',
        table: true,
        cards: [
          { id: 'mode.ai.base', names: ['Base'] },
          { id: 'mode.ai.less', names: ['Less AI Random'] },
          { id: 'mode.ai.no', names: ['No AI'] },
        ],
      },
      {
        id: 'mode.git',
        table: true,
        cards: [
          { id: 'mode.git.base', names: ['Base'] },
          { id: 'mode.git.strat', names: ['Strategic'] },
        ],
      },
    ],
  },
]

// ── тексты по id (на язык) ────────────────────────────────────────────────
interface RuleText {
  title?: string
  lead?: string
  body?: string[]
  desc?: string
  outro?: string
}

export interface RulesCopy {
  meta: string[]
  searchPlaceholder: string
  notFound: string
  text: Record<string, RuleText>
}

export const RULES_COPY_RU: RulesCopy = {
  meta: [
    'Кол-во игроков: от 2 до 6',
    'Время партии: 15–45 минут',
    'Колода основная: 104 карты',
    'Колода событий: 21 карта',
  ],
  searchPlaceholder: 'поиск по правилам…',
  notFound: 'Ничего не найдено',
  text: {
    objective: {
      title: 'Цель игры',
      body: [
        'Цель игры — первым собрать три разные карты Release (Frontend, Backend и Database) в своей зоне релиза, отразив все атаки противников, или остаться последним игроком.',
      ],
    },
    setup: {
      title: 'Подготовка к игре',
      body: [
        'Разделите карты на две колоды по цвету рубашки: зелёные — основная колода, фиолетовые — события.',
        'Каждому игроку раздайте по одной карте Debugger и по 4 случайные карты из основной колоды. Таким образом, у каждого в начале будет на руке 5 карт (1 Debugger + 4 случайные).',
        'Верните в основную колоду все выданные карты AI и Error 503. Возьмите вместо них другие случайные карты из основой колоды, чтобы в руке было 5 карт (триггер карты AI и Error 503 нельзя иметь на руках)',
        'Перетасуйте колоды.',
        'Положите основную и колоду событий на стол рубашкой вверх. Начинает игрок, который последним релизил на прод, или тот, кто недавно победил в настольных играх.',
      ],
    },
    turn: { title: 'Ход игрока' },
    'turn.play': {
      title: 'Розыгрыш карт',
      body: ['Разрешается сыграть любое количество карт (включая 0).'],
    },
    'turn.draw': {
      title: 'Добор карты',
      body: [
        'Игрок обязан взять одну карту сверху основной колоды, в любой момент своего хода. При разделенной колоды добора карта берется из всех колод.',
      ],
    },
    'turn.end': {
      title: 'Конец хода',
      body: [
        'Для удобства, чтобы обозначить конец своего хода, игрок может произнести слово «PUSH». Ход переходит к следующему игроку по часовой стрелке.',
      ],
    },
    end: {
      title: 'Конец игры',
      lead: 'Игра заканчивается, при выполнении одного из условий:',
      body: [
        'У одного из игроков в зоне релиза одновременно три разные карты Release (Frontend, Backend, Database).',
        'Остаётся только один игрок.',
      ],
    },
    mechanics: { title: 'Ключевые механики' },
    'mech.release': {
      title: 'Релиз карт',
      body: [
        'Зона релиза — область перед игроком предназначенная для карт Release (Frontend, Backend, Database).',
        'В зоне релиза может находиться только по одной карте каждого типа (нельзя выкладывать две одинаковые).',
        'За один ход можно выложить только одну карту Release.',
        'При выкладывании карт Release игрок сбрасывает одну карту из руки (по своему выбору) в колоду сброса.',
        'Когда игрок выкладывает карту Release, другие игроки могут мгновенно атаковать её картами со значком молнии (Bug, Out of Memory, Legacy Code, Security Bug)',
        'Карту Release можно выложить одновременно с картой Code Review — такая комбинация делает релиз неуязвимым к атакам (Bug, Out of Memory, Legacy Code, Security Bug, даже с Sudo). Code Review нельзя применить к уже выложенной карте Release.',
      ],
    },
    'mech.attack': {
      title: 'Атака и оборона',
      body: [
        'Атакующие карты (со значком молнии) разыгрываются мгновенно — на свежий релиз противника или против руки других игроков в свой ход.',
        'Оборона: сыграйте карты защиты Cancel или Unicorn против атакующих карт.',
        'Sudo усиливает карты с эффектом sudo.',
        'DDoS — единственная атака, работающая против защищённого релиза или карт Monitoring.',
      ],
    },
    'mech.trigger': {
      title: 'Карты-триггеры',
      body: [
        'AI: при доборе покажите карту всем игрокам и возьмите случайную карту эффекта из колоды событий.',
        'Error 503: при доборе покажите карту всем игрокам, нейтрализуйте её или вы выбываете из игры.',
      ],
    },
    'mech.events': {
      title: 'Колода событий (фиолетовая)',
      body: [
        'Лежит отдельно рубашкой вверх. Карты берутся случайно (из любого места колоды), только при вытягивании карты-триггера AI.',
      ],
    },
    cards: { title: 'Описание карт' },
    'cards.release': { title: 'Release карты' },
    'c.release': {
      desc: 'Поместите эти карты в зону релиза. Чтобы сыграть карту Release, необходимо скинуть одну карту по вашему выбору из руки в сброс. После выкладывания карты Release оппоненты получают право мгновенно атаковать её картами Bug, Out of Memory, Legacy Code или Security Bug. Игрок не может иметь в зоне релиза две одинаковые карты Release.',
    },
    'cards.defense': { title: 'Защитные карты' },
    'c.debugger': {
      desc: 'Сыграйте как защиту против Error 503 или Crush. Обе карты отправляются в сброс. (Карта Crush возвращается в AI колоду)',
    },
    'c.monitoring': {
      desc: 'Выложите карту перед собой в зону релиза (не более одной). Карта защищает от Error 503 и Crush. При доборе Error 503 или вытягивании Crush угроза от них игнорируется, а Monitoring остаётся в зоне релиза.',
    },
    'c.aimon': {
      desc: 'Карта автоматически выкладывается в зону релиза и работает как карта Monitoring. После уничтожения возвращается в AI колоду.',
    },
    'cards.attack': { title: 'Атакующие карты' },
    'c.bug': {
      desc: 'Используйте эти карты для атаки против свежего релиза карты Release (релиз отправляется в сброс). Или используйте карту, чтобы взять одну случайную карту из руки противника. sudo [карта]: Карты защиты Cancel не работают. Карты защиты Unicorn работают.',
    },
    'c.secbug': {
      desc: 'Используйте карту для атаки против свежего релиза карты Release — вы забираете карту релиза в свою зону релиза (если у вас выложен Release в зоне релиза, атакованный Release отправляется в сброс). Или используйте карту, чтобы запросить определенную карту из руки противника (если карта есть, противник отдает её вам, если нет — ничего не происходит, а карта атаки сбрасывается). sudo Security Bug: Карты защиты Cancel не работают. Карты защиты Unicorn работают.',
    },
    'c.ddos': {
      desc: 'Уничтожьте карту Monitoring / AI Monitoring, (карты отправляются в сброс). Или верните карту Release противника (даже если у нее есть Code Review, в этом случае Code Review сбрасывается) ему в руку. Эта карта Release замораживается на один раунд и не может быть разыграна этим игроком в следующем ходу.',
    },
    'cards.cancel': { title: 'Карты обороны' },
    'c.hotfix': {
      desc: '(тип Cancel) Отменяют атаку картами Bug, Out of Memory, Legacy Code или Security Bug. Обе карты (атака и оборона) сбрасываются.',
    },
    'c.rollback': {
      desc: '(тип Cancel) Отменяет атаку. Карта атаки возвращается в руку атакующего (он не может сыграть её повторно до своего следующего хода). Карта Rollback сбрасывается. sudo Rollback: жертва атаки забирает атакующую карту в свою руку.',
    },
    'c.notabug': {
      desc: '(тип Unicorn) Отменяет атаку. Обе карты (атака и оборона) сбрасываются. Работает даже против sudo-атаки.',
    },
    'c.wom': {
      desc: '(тип Unicorn) Отменяет атаку. Эффект карты атаки оборачивается против самого атакующего. Работает даже против sudo-атаки.',
    },
    'cards.support': { title: 'Карты поддержки' },
    'c.sudo': {
      desc: 'Разыграйте карту sudo вместе с картой, имеющей эффект sudo, чтобы активировать её усиленный эффект. Описание усиления вы найдете на соответствующих картах.',
    },
    'c.codereview': {
      desc: 'Разыгрывается одновременно с картой Release (нельзя применять к уже выложенной карте). Делает Release неуязвимой к атакам Bug, Out of Memory, Legacy Code или Security Bug (даже с sudo-усилением).',
    },
    'cards.git': { title: 'Карты Git-операций' },
    'c.gitbranch': {
      desc: 'Разделите одну колоду добора (зелёную) на две. sudo Git Branch: и переверните сброс — он будет использоваться как новая колода добора, не перемешивайте карты.',
    },
    'c.gitmerge': {
      desc: 'Объедините все колоды добора в одну и перетасуйте их. sudo Git Merge: добавьте сброс к новой колоде и тщательно перетасуйте.',
    },
    'c.gitrebase': {
      desc: 'Посмотрите три верхние карты из одной колоды добора и измените их порядок по своему усмотрению (не показывая другим игрокам). sudo Git Rebase: примените эффект ко всем колодам добора в игре.',
    },
    'c.gitcherry': {
      desc: 'Выберите одну карту из всего сброса и положите ее в свою руку. sudo Git Cherry-pick: выберите две карты из сброса — одну возьмите в руку, вторую положите наверх колоды добора (не показывая другим игрокам).',
    },
    'c.sysupgrade': {
      desc: 'Все остальные игроки скидывают по одной карте (по своему выбору) в сброс. sudo System Upgrade: выберите одну из сброшенных игроками карт и положите её себе в руку.',
    },
    'cards.trigger': { title: 'Триггер-карты' },
    'c.error503': {
      lead: 'При доборе немедленно покажите карту всем соперникам. Нейтрализуйте её одним из способов:',
      body: [
        'Сыграйте Debugger — обе карты сбрасываются.',
        'Если выложена Monitoring / AI Monitoring — сбрасывается только Error 503.',
        'Пожертвуйте одну свою карту Release из зоны релиза (включая Code Review) — обе карты сбрасываются.',
      ],
      outro: 'Без нейтрализации игрок выбывает из игры.',
    },
    'c.ai': {
      desc: 'При доборе немедленно покажите карту всем соперникам. Карта AI отправляется в сброс. Затем возьмите одну случайную карту AI эффекта из колоды событий.',
    },
    'cards.ai': {
      title: 'Карты AI-эффектов',
      lead: 'При доборе тригер-карты AI из основной колоды немедленно покажите её всем игрокам и положите в сброс. Затем вытяните случайную карту из колоды событий, покажите её всем игрокам и сразу разыграйте. После выполнения эффекта, карта возвращается в колоду событий.',
    },
    'ai.mon': { desc: 'автоматически выкладывается в зону релиза и работает как Monitoring.' },
    'ai.crush': {
      desc: 'уничтожает соответствующую карту Release (нейтрализация аналогична Error 503).',
    },
    'ai.release': {
      desc: 'карта немедленно выкладывается в зону релиза (если нет карты Release такого же типа). Этот релиз можно атаковать, но нельзя усилить картой Code Review.',
    },
    'ai.inside': { desc: 'возьмите одну карту Release из сброса в руку.' },
    'ai.goodvibe': {
      desc: 'доберите 2 карты (карты AI/Error 503 срабатывают как при обычном доборе).',
    },
    'ai.badvibe': { desc: 'сбросьте одну карту из руки (по своему выбору).' },
    'ai.hallucination': { desc: 'немедленно завершите свой ход.' },
    'ai.error503': { desc: 'работает как обычная карта Error 503' },
    modes: {
      title: 'Игровые режимы',
      lead: 'Игроки могут скомбинировать вариации правил перед началом партии.',
      outro: '// Режим Base соответствет основным правилам игры.',
    },
    'mode.hand': { title: 'Лимит карт в руке (в конце хода)' },
    'mode.hand.base': { desc: 'Без ограничений' },
    'mode.hand.8bit': { desc: 'Не более 8 карт' },
    'mode.hand.mem': { desc: 'Не более 5 карт' },
    'mode.rel': { title: 'Количество релизов за ход' },
    'mode.rel.base': { desc: 'Не более 1' },
    'mode.rel.fast': { desc: 'Без ограничений' },
    'mode.cond': { title: 'Условие релиза' },
    'mode.cond.base': { desc: 'Сброс 1 карты за релиз' },
    'mode.cond.easy': { desc: 'Без сброса карт за релиз' },
    'mode.ai': { title: 'Кол-во AI в игре' },
    'mode.ai.base': { desc: 'Без изменений' },
    'mode.ai.less': { desc: 'Убрать: 6 AI карт, 1 Error 503, 1 Debugger' },
    'mode.ai.no': { desc: 'Убрать: все AI карты, 1 Error 503, 2 Debugger' },
    'mode.git': { title: 'Последствия Git Branch' },
    'mode.git.base': { desc: 'Добор из всех колод' },
    'mode.git.strat': { desc: 'Добор только из одной колоды' },
  },
}

// Скелет + copy → собранные секции для рендера.
function buildSections(skel: SectionSkel[], copy: RulesCopy): RulesSection[] {
  const t = (id: string): RuleText => copy.text[id] ?? {}
  return skel.map((s) => {
    const st = t(s.id)
    return {
      title: st.title ?? '',
      groupStart: s.groupStart,
      lead: st.lead,
      body: st.body,
      outro: st.outro,
      groups: s.groups?.map((g) => {
        const gt = t(g.id)
        return {
          title: gt.title,
          table: g.table,
          lead: gt.lead,
          body: gt.body,
          outro: gt.outro,
          cards: g.cards?.map((c) => {
            const ct = t(c.id)
            return { names: c.names, desc: ct.desc, lead: ct.lead, body: ct.body, outro: ct.outro }
          }),
        }
      }),
    }
  })
}

export interface RulesProps {
  copy?: RulesCopy
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Фильтрация по смысловым блокам (сужение): совпавшая секция показывается
// целиком, иначе сворачивается до совпавших подразделов и карт.
const inc = (hay: string, q: string) => hay.toLowerCase().includes(q)
const cardHay = (c: RuleCard) =>
  [...c.names, c.desc, c.lead, c.outro, ...(c.body ?? [])].filter(Boolean).join(' ')
const groupHay = (g: RuleGroup) => [g.title, g.lead, g.outro, ...(g.body ?? [])].join(' ')
const sectionHay = (s: RulesSection) => [s.title, s.lead, s.outro, ...(s.body ?? [])].join(' ')

// Имена карт — выделяются жирным, когда встречаются в тексте правил.
// Длинные имена идут первыми при матчинге (Security Bug раньше Bug,
// AI Monitoring раньше AI) — для этого сортируем по длине при сборке регэкспа.
const CARD_TERMS = [
  'AI Monitoring',
  'Crush Frontend',
  'Crush Backend',
  'Crush Database',
  'Release Frontend',
  'Release Backend',
  'Release Database',
  'Out of Memory',
  'Legacy Code',
  'Security Bug',
  'Code Review',
  'Rubber Ducky',
  'PR Approved',
  'Not a Bug',
  'Works on my Machine',
  'Git Branch',
  'Git Merge',
  'Git Rebase',
  'Git Cherry-pick',
  'System Upgrade',
  'Good Vibe-Coding',
  'Bad Vibe-Coding',
  'Memory Problem',
  'Fast Release',
  'Easy Release',
  'Less AI Random',
  'Error 503',
  '8 bit',
  'No AI',
  'Frontend',
  'Backend',
  'Database',
  'Debugger',
  'Monitoring',
  'Hotfix',
  'Rollback',
  'Hallucination',
  'Inside',
  'DDoS',
  'Sudo',
  'Release',
  'Crush',
  'Cancel',
  'Unicorn',
  'Bug',
  'Strategic',
  'Base',
  'AI',
]
const TERM_RE = new RegExp(
  `(${[...CARD_TERMS]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})`,
)

// Текст с именами карт, обёрнутыми в <b> (жирный — см. .rules b). split по
// захватывающей группе чередует обычный текст и совпадения: нечётные — имена.
const rich = (text: string): ReactNode =>
  text.split(TERM_RE).map((part, i) =>
    i % 2 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: позиционные фрагменты split — порядок стабилен
      <b key={i}>{part}</b>
    ) : (
      part
    ),
  )

// Арт карты по имени — из каталога CARDS (единый источник; первое совпадение).
const ART_BY_NAME = new Map<string, string>()
for (const c of CARDS) if (!ART_BY_NAME.has(c.name)) ART_BY_NAME.set(c.name, c.art)

// Превью для имён записи: имена без карты в каталоге (режимы) отсеиваются.
const artsFor = (names: string[]) =>
  names
    .map((name) => ({ name, src: ART_BY_NAME.get(name) }))
    .filter((a): a is { name: string; src: string } => Boolean(a.src))

// Усиленный (sudo) эффект в описании карты: выносим на новую строку, жёлтым
// подсвечиваем только метку «sudo + имя карты» (mark), текст эффекта (rest) —
// обычный. Двоеточие отделяет метку и отсеивает «sudo-атаки» / «эффект sudo».
const splitSudo = (desc: string) => {
  const m = desc.match(/^(.*?)\s+(sudo\b[^:]*)(:.*)$/is)
  return m ? { main: m[1], mark: m[2], rest: m[3] } : null
}

// Presentational + i18n-agnostic: текст приходит через copy (по умолчанию RU).
//
// Поиск повторяет браузерный «найти на странице»: текст не фильтруется, все
// совпадения подсвечиваются и нумеруются (data-mi в DOM-порядке), активное
// выделяется ярче; стрелки / Enter переключают активное и скроллят к нему.
export default function Rules({ copy = RULES_COPY_RU }: RulesProps = {}) {
  const sections = useMemo(() => buildSections(RULES, copy), [copy])
  const meta = copy.meta
  const searchPlaceholder = copy.searchPlaceholder
  const notFoundText = copy.notFound

  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [count, setCount] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const query = q.trim()
  const ql = query.toLowerCase()

  // Сужение: совпавшая секция целиком, иначе — только совпавшие подразделы/карты.
  const groupView = (g: RuleGroup): RuleGroup | null => {
    if (inc(groupHay(g), ql)) return g
    const cards = (g.cards ?? []).filter((c) => inc(cardHay(c), ql))
    return cards.length ? { ...g, cards } : null
  }
  const sectionView = (s: RulesSection): RulesSection | null => {
    if (!query) return s
    if (inc(sectionHay(s), ql)) return s
    const groups = (s.groups ?? []).map(groupView).filter((g): g is RuleGroup => g !== null)
    return groups.length ? { ...s, groups } : null
  }
  const shown = sections.map(sectionView).filter((s): s is RulesSection => s !== null)

  // Захватывающая группа — чтобы split чередовал обычный текст и совпадения.
  const queryRe = query ? new RegExp(`(${escapeRe(query)})`, 'ig') : null

  // Счётчик совпадений обнуляется каждый рендер: marker() присваивает каждому
  // совпадению data-mi в DOM-порядке (он же — порядок навигации).
  const counter = { n: 0 }
  const marker = (text: string, withTerms: boolean): ReactNode => {
    if (!queryRe) return withTerms ? rich(text) : text
    return text.split(queryRe).map((part, i) => {
      if (!part) return null
      if (i % 2 === 1) {
        const mi = counter.n++
        return (
          <mark
            key={`m${mi}`}
            data-mi={mi}
            className={mi === active ? styles.markActive : styles.mark}
          >
            {part}
          </mark>
        )
      }
      // biome-ignore lint/suspicious/noArrayIndexKey: позиционные фрагменты split — порядок стабилен
      return <Fragment key={i}>{withTerms ? rich(part) : part}</Fragment>
    })
  }
  const hl = (text: string) => marker(text, false) // заголовки/имена — без жирных имён карт
  const txt = (text: string) => marker(text, true) // проза — с жирными именами карт

  // Пересчёт совпадений после рендера: зависит от запроса (меняется набор
  // отрисованных совпадений), хотя query и не используется в теле напрямую.
  // biome-ignore lint/correctness/useExhaustiveDependencies: query управляет числом совпадений в DOM
  useLayoutEffect(() => {
    setCount(boxRef.current?.querySelectorAll('[data-mi]').length ?? 0)
  }, [query])

  // Скролл к активному совпадению.
  useEffect(() => {
    if (count === 0) return
    boxRef.current
      ?.querySelector(`[data-mi="${active}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active, count])

  const go = (dir: 1 | -1) => {
    if (count > 0) setActive((a) => (a + dir + count) % count)
  }
  const onSearch = (v: string) => {
    setQ(v)
    setActive(0)
  }

  const renderBody = (body?: string[]) => {
    if (!body || body.length === 0) return null
    if (body.length === 1) return <p className={styles.para}>{txt(body[0])}</p>
    return (
      <ul className={styles.list}>
        {body.map((line) => (
          <li key={line}>{txt(line)}</li>
        ))}
      </ul>
    )
  }

  const renderCards = (cards?: RuleCard[]) =>
    cards?.map((c) => {
      const arts = artsFor(c.names)
      const sudo = c.desc ? splitSudo(c.desc) : null
      return (
        <div key={c.names.join('/')} className={styles.card}>
          {arts.length > 0 && (
            <div className={styles.cardArt}>
              {arts.map((a) => (
                <img key={a.src} className={styles.cardThumb} src={a.src} alt={a.name} />
              ))}
            </div>
          )}
          <div className={styles.cardText}>
            <p className={styles.cardName}>{hl(c.names.join(' · '))}</p>
            {c.lead && <p className={styles.cardDesc}>{txt(c.lead)}</p>}
            {c.desc && <p className={styles.cardDesc}>{txt(sudo ? sudo.main : c.desc)}</p>}
            {sudo && (
              <p className={styles.sudoLine}>
                <span className={styles.sudoMark}>{hl(sudo.mark)}</span>
                {txt(sudo.rest)}
              </p>
            )}
            {c.body && (
              <ul className={styles.cardList}>
                {c.body.map((line) => (
                  <li key={line}>{txt(line)}</li>
                ))}
              </ul>
            )}
            {c.outro && <p className={styles.cardOutro}>{txt(c.outro)}</p>}
          </div>
        </div>
      )
    })

  // Игровые режимы — таблица «опция → эффект».
  const renderModeTable = (cards?: RuleCard[]) =>
    cards && (
      <div className={styles.modeTable}>
        {cards.map((c) => (
          <Fragment key={c.names.join('/')}>
            <div className={styles.modeName}>{hl(c.names.join(' · '))}</div>
            <div className={styles.modeVal}>{txt(c.desc ?? '')}</div>
          </Fragment>
        ))}
      </div>
    )

  return (
    <div ref={boxRef} className={styles.rules}>
      <div className={styles.searchBar}>
        <input
          className={styles.search}
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go(e.shiftKey ? -1 : 1)
            else if (e.key === 'ArrowDown') {
              e.preventDefault()
              go(1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              go(-1)
            } else if (e.key === 'Escape') onSearch('')
          }}
          placeholder={searchPlaceholder}
        />
        {query && (
          <div className={styles.searchTools}>
            <span className={styles.count}>{count ? `${active + 1}/${count}` : '0/0'}</span>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => go(-1)}
              disabled={!count}
              aria-label="предыдущее совпадение"
            >
              ↑
            </button>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => go(1)}
              disabled={!count}
              aria-label="следующее совпадение"
            >
              ↓
            </button>
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => onSearch('')}
              aria-label="очистить поиск"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {!query && (
        <ul className={styles.meta}>
          {meta.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {shown.map((s) => (
        <section
          key={s.title}
          className={s.groupStart ? `${styles.sec} ${styles.secGap}` : styles.sec}
        >
          <h4 className={styles.h}>{hl(s.title)}</h4>
          {s.lead && <p className={styles.para}>{txt(s.lead)}</p>}
          {renderBody(s.body)}

          {s.groups?.map((g) => (
            <div key={g.title ?? g.cards?.[0]?.names.join('/')} className={styles.group}>
              <div className={styles.groupBody}>
                {g.title && <h5 className={styles.sub}>{hl(g.title)}</h5>}
                {g.lead && <p className={styles.para}>{txt(g.lead)}</p>}
                {renderBody(g.body)}
                {g.table ? renderModeTable(g.cards) : renderCards(g.cards)}
                {g.outro && <p className={styles.outro}>{txt(g.outro)}</p>}
              </div>
            </div>
          ))}

          {s.outro && <p className={styles.outro}>{txt(s.outro)}</p>}
        </section>
      ))}

      {query && shown.length === 0 && <p className={styles.empty}>{notFoundText}</p>}
    </div>
  )
}
