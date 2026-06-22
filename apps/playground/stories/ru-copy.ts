// Russian display copy for the playground stories. The @release/ui library is
// i18n-agnostic — components receive their user-visible strings via props — so
// the playground (a consuming app) supplies the copy here. Real apps pass their
// own translated copy (e.g. via react-i18next in the frontend).
import type { ModesCopy } from '@/game/modes'
import type { LobbyCopy } from '@/screens/Lobby/Lobby'
import type { RulesCopy } from '@/screens/Start/Rules'
import type { StatsCopy } from '@/screens/Stats'
import type { TableCopy } from '@/table/Table/Table'

export const RU_MODES: ModesCopy = {
  handLimit: {
    title: 'Лимит карт в руке (в конце хода)',
    options: {
      base: { label: 'Base', desc: 'Без ограничений' },
      '8bit': { label: '8 bit', desc: 'Не более 8 карт' },
      memory: { label: 'Memory Problem', desc: 'Не более 5 карт' },
    },
  },
  releases: {
    title: 'Количество релизов за ход',
    options: {
      base: { label: 'Base', desc: 'Не более 1' },
      fast: { label: 'Fast Release', desc: 'Без ограничений' },
    },
  },
  releaseCond: {
    title: 'Условие релиза',
    options: {
      base: { label: 'Base', desc: 'Сброс 1 карты за релиз' },
      easy: { label: 'Easy Release', desc: 'Без сброса карт за релиз' },
    },
  },
  ai: {
    title: 'Кол-во AI в игре',
    options: {
      base: { label: 'Base', desc: 'Без изменений' },
      less: { label: 'Less AI Random', desc: 'Убрать: 6 AI карт, 1 Error 503, 1 Debugger' },
      no: { label: 'No AI', desc: 'Убрать: все AI карты, 1 Error 503, 2 Debugger' },
    },
  },
  gitBranch: {
    title: 'Последствия Git Branch',
    options: {
      base: { label: 'Base', desc: 'Добор из всех колод' },
      strategic: { label: 'Strategic', desc: 'Добор только из одной колоды' },
    },
  },
}

export const RU_STATS: StatsCopy = {
  title: 'Итоги партии',
  sub: 'Партия завершена',
  winnerLabel: 'победитель',
  winTag: 'winner',
  colName: 'игрок',
  colLocation: 'где сейчас',
  colAttacking: 'атакующих',
  colDefending: 'защитных',
  toLobby: 'в лобби',
  location: {
    game: 'в игре',
    stats: 'на статистике',
    lobby: 'в лобби',
    offline: 'не в сети',
  },
  achievements: {
    ddos: { title: 'King of DDoS', unit: 'раз сыграл DDoS' },
    ai: { title: 'AI зависимый', unit: 'карт AI из колоды' },
    err503: { title: 'Везучий', unit: 'ошибок 503 из колоды' },
    cherryPick: { title: 'Кладоискатель', unit: 'раз достал из сброса' },
    attackedInto: { title: 'Забагованный', unit: 'карт атаки прилетело' },
  },
}

export const RU_RULES: RulesCopy = {
  searchPlaceholder: 'поиск по правилам…',
  empty: 'Ничего не найдено',
  meta: ['2–6 игроков', '15–45 минут', '104 карты + 21 событие'],
  foot: 'Режимы (лимит руки, Fast Release, условие релиза, кол-во AI) выбираются перед партией — подробности появятся в окне создания игры.',
  sections: [
    {
      title: 'Цель',
      body: [
        'Первым собрать три разные карты Release (Frontend, Backend, Database) в своей зоне релиза, отразив все атаки противников, — или остаться последним игроком в партии.',
      ],
    },
    {
      title: 'Подготовка',
      body: [
        'Две колоды по цвету рубашки: зелёная — основная, фиолетовая — события.',
        'Каждому: 1 карта Debugger + 4 случайные (всего 5 на руке).',
        'Карты AI и Error 503 на старте недопустимы — замените их на руке.',
        'Перетасуйте и положите обе колоды рубашкой вверх.',
      ],
    },
    {
      title: 'Ход игрока',
      note: 'действие / добор / действие / конец хода',
      body: [
        'До и после добора можно сыграть любое число карт (в том числе 0).',
        'Добор — ровно одна карта сверху основной колоды (обязателен).',
        'Конец хода обозначается словом «PUSH», ход идёт по часовой стрелке.',
      ],
    },
    {
      title: 'Релиз карт',
      body: [
        'Зона релиза — место для карт Release; по одной каждого типа.',
        'За ход — только один релиз; при выкладывании сбрасывается 1 карта с руки.',
        'На свежий релиз соперники могут мгновенно ответить атакой со значком молнии (Bug, Out of Memory, Legacy Code, Security Bug).',
        'Code Review играется вместе с Release и делает его неуязвимым к этим атакам (даже с Sudo). К уже выложенному релизу не применяется.',
      ],
    },
    {
      title: 'Атака и оборона',
      body: [
        'Атакующие карты (молния) играются мгновенно — на релиз или по руке.',
        'Оборона: Cancel (Hotfix, Rubber Ducky, PR Approved, Rollback) и Unicorn (Not a Bug, Works on my Machine).',
        'Sudo усиливает карты с эффектом sudo; Cancel против усиления не работает, Unicorn — работает.',
        'DDoS — единственная атака против защищённого релиза и Monitoring.',
      ],
    },
    {
      title: 'Карты-триггеры',
      body: [
        'AI: при доборе покажите всем и разыграйте случайный эффект из колоды событий.',
        'Error 503: при доборе покажите всем и нейтрализуйте (Debugger, Monitoring или жертва релиза) — иначе выбываете.',
      ],
    },
    {
      title: 'Конец игры',
      body: [
        'Партия заканчивается, когда у игрока в зоне релиза одновременно три разные карты Release — либо когда остаётся единственный игрок.',
      ],
    },
  ],
}

export const RU_TABLE: TableCopy = {
  tabs: { history: 'история', participants: 'участники', rules: 'правила', modes: 'игровой режим' },
  decks: { main: 'колода', events: 'события', discard: 'сброс' },
  youEliminated: 'вы выбыли из игры',
  reconnecting: 'переподключение…',
  seat: { eliminated: 'выбыл', disconnected: 'нет связи', cards: 'карт' },
  participants: {
    playersTitle: 'игроки',
    spectatorsTitle: 'зрители',
    inGame: 'в игре',
    eliminated: 'выбыл',
    disconnected: 'потеряно соединение',
    spectatorTag: 'зритель',
    noSpectators: 'пока без зрителей',
  },
  gameOver: {
    winnerLabel: 'победитель',
    condition: { release: 'Собраны 3 релиза', lastStanding: 'Остался последним' },
    continue: 'к статистике',
  },
  rules: RU_RULES,
  modes: RU_MODES,
}

export const RU_LOBBY: LobbyCopy = {
  title: 'Лобби',
  disband: 'расформировать',
  waiting: 'Ожидание игроков…',
  gameCode: 'код игры',
  copyCode: 'копировать',
  modesTitle: 'Режимы партии',
  hostConfigures: 'настраивает host',
  playersTitle: 'Игроки',
  capacity: 'Вместимость',
  spectatorsTitle: 'Зрители',
  specLimit: 'Лимит',
  you: '(вы)',
  hostTag: 'host',
  ready: 'готов',
  notReady: 'не готов',
  waitingStatus: 'ожидание',
  offline: 'не в сети',
  makeSpectator: 'Сделать зрителем',
  makePlayer: 'Сделать игроком',
  noSlot: 'Нет доступного слота',
  kick: 'Исключить',
  emptySlot: 'свободный слот',
  spectatorTag: 'зритель',
  noSpectators: 'пока без зрителей',
  startGame: 'начать игру',
  leave: 'покинуть',
  actions: 'действия',
  unavailable: 'Недоступно',
  disbandTitle: 'Расформировать лобби?',
  disbandText:
    'Лобби будет закрыто, все подключённые игроки — отключены. Действие нельзя отменить.',
  cancel: 'отмена',
  modes: RU_MODES,
}
