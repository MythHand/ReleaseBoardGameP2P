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

export const RULES_COPY_EN: RulesCopy = {
  meta: [
    'Players: 2 to 6',
    'Game length: 15–45 min',
    'Main deck: 104 cards',
    'Event deck: 21 cards',
  ],
  searchPlaceholder: 'search the rules…',
  notFound: 'Nothing found',
  text: {
    objective: {
      title: 'Objective',
      body: [
        'Be the first to collect three different Release cards (Frontend, Backend and Database) in your release zone, fending off every opponent attack — or be the last player standing.',
      ],
    },
    setup: {
      title: 'Setup',
      body: [
        'Split the cards into two decks by back colour: green — the main deck, purple — events.',
        'Deal each player one Debugger and 4 random cards from the main deck. So everyone starts with 5 cards in hand (1 Debugger + 4 random).',
        'Return any dealt AI and Error 503 cards to the main deck and draw replacements instead, so the hand has 5 cards (the AI and Error 503 trigger cards can’t be held in hand).',
        'Shuffle the decks.',
        'Place the main and event decks on the table face down. The player who shipped to prod last starts, or whoever recently won at board games.',
      ],
    },
    turn: { title: 'Player turn' },
    'turn.play': {
      title: 'Playing cards',
      body: ['You may play any number of cards (including 0).'],
    },
    'turn.draw': {
      title: 'Drawing a card',
      body: [
        'You must take one card from the top of the main deck at any point during your turn. If the draw deck is split, the card is taken from all decks.',
      ],
    },
    'turn.end': {
      title: 'End of turn',
      body: [
        'To mark the end of your turn you may say “PUSH”. The turn passes to the next player clockwise.',
      ],
    },
    end: {
      title: 'End of game',
      lead: 'The game ends when one of these conditions is met:',
      body: [
        'One player has three different Release cards (Frontend, Backend, Database) in their release zone at once.',
        'Only one player remains.',
      ],
    },
    mechanics: { title: 'Key mechanics' },
    'mech.release': {
      title: 'Releasing cards',
      body: [
        'The release zone is the area in front of a player, meant for Release cards (Frontend, Backend, Database).',
        'The release zone can hold only one card of each type (you can’t lay two identical ones).',
        'Only one Release card can be laid per turn.',
        'When laying a Release card, the player discards one card from hand (their choice) to the discard pile.',
        'When a player lays a Release card, other players may instantly attack it with lightning-icon cards (Bug, Out of Memory, Legacy Code, Security Bug)',
        'A Release card can be laid together with Code Review — this combo makes the release immune to attacks (Bug, Out of Memory, Legacy Code, Security Bug, even with Sudo). Code Review can’t be applied to an already-laid Release card.',
      ],
    },
    'mech.attack': {
      title: 'Attack and defence',
      body: [
        'Attack cards (lightning icon) are played instantly — on an opponent’s fresh release, or against other players’ hands on your turn.',
        'Defence: play Cancel or Unicorn defence cards against attack cards.',
        'Sudo boosts cards that have a sudo effect.',
        'DDoS is the only attack that works against a protected release or Monitoring cards.',
      ],
    },
    'mech.trigger': {
      title: 'Trigger cards',
      body: [
        'AI: on draw, show the card to all players and take a random effect card from the event deck.',
        'Error 503: on draw, show the card to all players and neutralise it, or you’re out of the game.',
      ],
    },
    'mech.events': {
      title: 'Event deck (purple)',
      body: [
        'Kept separately, face down. Cards are taken at random (from anywhere in the deck) only when an AI trigger card is drawn.',
      ],
    },
    cards: { title: 'Card reference' },
    'cards.release': { title: 'Release cards' },
    'c.release': {
      desc: 'Place these cards in the release zone. To play a Release card you must discard one card of your choice from hand to the discard pile. After a Release card is laid, opponents get the right to instantly attack it with Bug, Out of Memory, Legacy Code or Security Bug. A player can’t have two identical Release cards in the release zone.',
    },
    'cards.defense': { title: 'Defensive cards' },
    'c.debugger': {
      desc: 'Play as defence against Error 503 or Crush. Both cards go to the discard pile. (The Crush card returns to the AI deck)',
    },
    'c.monitoring': {
      desc: 'Lay the card in front of you in the release zone (no more than one). It protects from Error 503 and Crush: on drawing Error 503 or Crush their threat is ignored, and Monitoring stays in the release zone.',
    },
    'c.aimon': {
      desc: 'The card is laid into the release zone automatically and works like a Monitoring card. After being destroyed it returns to the AI deck.',
    },
    'cards.attack': { title: 'Attack cards' },
    'c.bug': {
      desc: 'Use these cards to attack a fresh Release card (the release goes to the discard pile). Or use the card to take one random card from an opponent’s hand. sudo [card]: Cancel defence cards don’t work. Unicorn defence cards do work.',
    },
    'c.secbug': {
      desc: 'Use the card to attack a fresh Release card — you take the release card into your own release zone (if you already have a Release laid in your zone, the attacked Release goes to the discard pile). Or use the card to request a specific card from an opponent’s hand (if they have it, they give it to you; if not, nothing happens and the attack card is discarded). sudo Security Bug: Cancel defence cards don’t work. Unicorn defence cards do work.',
    },
    'c.ddos': {
      desc: 'Destroy a Monitoring / AI Monitoring card (the cards go to the discard pile). Or return an opponent’s Release card to their hand (even if it has Code Review — in that case Code Review is discarded). That Release card is frozen for one round and can’t be played by that player on their next turn.',
    },
    'cards.cancel': { title: 'Defence cards' },
    'c.hotfix': {
      desc: '(Cancel type) Cancel an attack by Bug, Out of Memory, Legacy Code or Security Bug. Both cards (attack and defence) are discarded.',
    },
    'c.rollback': {
      desc: '(Cancel type) Cancels an attack. The attack card returns to the attacker’s hand (they can’t replay it until their next turn). The Rollback card is discarded. sudo Rollback: the attack’s victim takes the attacking card into their own hand.',
    },
    'c.notabug': {
      desc: '(Unicorn type) Cancels an attack. Both cards (attack and defence) are discarded. Works even against a sudo attack.',
    },
    'c.wom': {
      desc: '(Unicorn type) Cancels an attack. The attack card’s effect is turned back on the attacker. Works even against a sudo attack.',
    },
    'cards.support': { title: 'Support cards' },
    'c.sudo': {
      desc: 'Play the sudo card together with a card that has a sudo effect to activate its boosted effect. You’ll find the boost description on the respective cards.',
    },
    'c.codereview': {
      desc: 'Played together with a Release card (can’t be applied to an already-laid card). Makes the Release immune to Bug, Out of Memory, Legacy Code or Security Bug attacks (even with a sudo boost).',
    },
    'cards.git': { title: 'Git operation cards' },
    'c.gitbranch': {
      desc: 'Split one (green) draw deck into two. sudo Git Branch: and flip the discard pile — it will be used as a new draw deck, don’t shuffle the cards.',
    },
    'c.gitmerge': {
      desc: 'Merge all draw decks into one and shuffle them. sudo Git Merge: add the discard pile to the new deck and shuffle thoroughly.',
    },
    'c.gitrebase': {
      desc: 'Look at the top three cards of one draw deck and reorder them as you wish (without showing other players). sudo Git Rebase: apply the effect to all draw decks in play.',
    },
    'c.gitcherry': {
      desc: 'Pick one card from the entire discard pile and put it into your hand. sudo Git Cherry-pick: pick two cards from the discard pile — take one into your hand, place the other on top of the draw deck (without showing other players).',
    },
    'c.sysupgrade': {
      desc: 'All other players discard one card each (their choice) to the discard pile. sudo System Upgrade: pick one of the cards discarded by players and put it into your hand.',
    },
    'cards.trigger': { title: 'Trigger cards' },
    'c.error503': {
      lead: 'On draw, immediately show the card to all opponents. Neutralise it one of these ways:',
      body: [
        'Play Debugger — both cards are discarded.',
        'If Monitoring / AI Monitoring is laid — only Error 503 is discarded.',
        'Sacrifice one of your Release cards from the release zone (including Code Review) — both cards are discarded.',
      ],
      outro: 'Without neutralising it, the player is out of the game.',
    },
    'c.ai': {
      desc: 'On draw, immediately show the card to all opponents. The AI card goes to the discard pile. Then take one random AI effect card from the event deck.',
    },
    'cards.ai': {
      title: 'AI effect cards',
      lead: 'When you draw the AI trigger card from the main deck, immediately show it to all players and put it in the discard pile. Then draw a random card from the event deck, show it to all players and play it right away. After the effect is done, the card returns to the event deck.',
    },
    'ai.mon': { desc: 'laid into the release zone automatically and works like Monitoring.' },
    'ai.crush': {
      desc: 'destroys the matching Release card (neutralised the same way as Error 503).',
    },
    'ai.release': {
      desc: 'the card is laid into the release zone immediately (if there’s no Release of the same type). This release can be attacked but can’t be boosted with Code Review.',
    },
    'ai.inside': { desc: 'take one Release card from the discard pile into your hand.' },
    'ai.goodvibe': { desc: 'draw 2 cards (AI/Error 503 trigger as on a normal draw).' },
    'ai.badvibe': { desc: 'discard one card from hand (your choice).' },
    'ai.hallucination': { desc: 'end your turn immediately.' },
    'ai.error503': { desc: 'works like a normal Error 503 card' },
    modes: {
      title: 'Game modes',
      lead: 'Players can combine rule variations before the game starts.',
      outro: '// Base mode matches the core rules of the game.',
    },
    'mode.hand': { title: 'Hand size limit (at end of turn)' },
    'mode.hand.base': { desc: 'No limit' },
    'mode.hand.8bit': { desc: 'No more than 8 cards' },
    'mode.hand.mem': { desc: 'No more than 5 cards' },
    'mode.rel': { title: 'Releases per turn' },
    'mode.rel.base': { desc: 'No more than 1' },
    'mode.rel.fast': { desc: 'No limit' },
    'mode.cond': { title: 'Release condition' },
    'mode.cond.base': { desc: 'Discard 1 card per release' },
    'mode.cond.easy': { desc: 'No discard per release' },
    'mode.ai': { title: 'Number of AI in the game' },
    'mode.ai.base': { desc: 'No changes' },
    'mode.ai.less': { desc: 'Remove: 6 AI cards, 1 Error 503, 1 Debugger' },
    'mode.ai.no': { desc: 'Remove: all AI cards, 1 Error 503, 2 Debugger' },
    'mode.git': { title: 'Git Branch consequences' },
    'mode.git.base': { desc: 'Draw from all decks' },
    'mode.git.strat': { desc: 'Draw from one deck only' },
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
    return cards.length > 0 ? { ...g, cards } : null
  }
  const sectionView = (s: RulesSection): RulesSection | null => {
    if (!query) return s
    if (inc(sectionHay(s), ql)) return s
    const groups = (s.groups ?? []).map(groupView).filter((g): g is RuleGroup => g !== null)
    return groups.length > 0 ? { ...s, groups } : null
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
