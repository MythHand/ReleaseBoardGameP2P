// Каталог карт = «сущности карт»: статические определения (арт + метаданные).
// Источник арта — public/assets/cards/, скопировано из user_input/Card.
//
// СЕЙЧАС здесь стартовый набор по одной карте на каждую категорию (имена/теги
// прочитаны с самих артов — точно, без угадывания). Полный каталог
// (25 base + 12 ai) дополняем отдельным проходом, считывая заголовок каждой карты.

/**
 * @typedef {Object} Card
 * @property {string} id        стабильный уникальный id
 * @property {string} name      имя карты (с арта)
 * @property {keyof import('./categories.js').CATEGORIES} category
 * @property {'base'|'ai'} deck  колода (определяет рубашку)
 * @property {string} art        путь к лицу (PNG в /assets)
 * @property {string[]} tags     теги поведения: 'lightning'|'sudo'|'cancel'|'unicorn'|'trigger'|'ai'
 * @property {number} qty        число копий в колоде (из исходных имён файлов)
 */

// Имена файлов содержат пробелы — кодируем для URL.
export const assetUrl = (path) =>
  path.split('/').map(encodeURIComponent).join('/')

export const COVERS = {
  base: '/assets/cards/covers/Cover - base - 104 qty.png',
  ai: '/assets/cards/covers/Cover - ai - 21 qty.png',
}

/** @type {Card[]} */
export const CARDS = [
  {
    id: 'release-database',
    name: 'Database',
    category: 'release',
    deck: 'base',
    art: '/assets/cards/base/Release 1 - 5 qty.png',
    tags: [],
    qty: 5,
  },
  {
    id: 'release-backend',
    name: 'Backend',
    category: 'release',
    deck: 'base',
    art: '/assets/cards/base/Release 2 - 4 qty.png',
    tags: [],
    qty: 4,
  },
  {
    id: 'release-frontend',
    name: 'Frontend',
    category: 'release',
    deck: 'base',
    art: '/assets/cards/base/Release 3 - 4 qty.png',
    tags: [],
    qty: 4,
  },
  {
    id: 'attack-security-bug',
    name: 'Security Bug',
    category: 'attack',
    deck: 'base',
    art: '/assets/cards/base/Attack 1 - 5 qty.png',
    tags: ['lightning', 'sudo'],
    qty: 5,
  },
  {
    id: 'operation-system-upgrade',
    name: 'System Upgrade',
    category: 'operation',
    deck: 'base',
    art: '/assets/cards/base/Operation 1 - 2 qty.png',
    tags: ['sudo'],
    qty: 2,
  },
  {
    id: 'defense-not-a-bug',
    name: 'Not a Bug',
    category: 'defense',
    deck: 'base',
    art: '/assets/cards/base/Defense 1 - 2 qty.png',
    tags: ['unicorn'],
    qty: 2,
  },
  {
    id: 'protection-monitoring',
    name: 'Monitoring',
    category: 'protection',
    deck: 'base',
    art: '/assets/cards/base/Protection 1 - 4 qty.png',
    tags: [],
    qty: 4,
  },
  {
    id: 'support-sudo',
    name: 'Sudo',
    category: 'support',
    deck: 'base',
    art: '/assets/cards/base/Support 1 - 5 qty.png',
    tags: ['combo-source'],
    qty: 5,
  },
  {
    id: 'support-code-review',
    name: 'Code Review',
    category: 'support',
    deck: 'base',
    art: '/assets/cards/base/Support 2 - 5 qty.png',
    tags: ['combo-source'],
    qty: 5,
  },
  {
    id: 'trigger-error-503',
    name: 'Error 503',
    category: 'trigger',
    deck: 'base',
    art: '/assets/cards/base/Trigger - 7 qty.png',
    tags: ['trigger'],
    qty: 7,
  },
  {
    id: 'ai-crush-database',
    name: 'Crush Database',
    category: 'ai',
    deck: 'ai',
    art: '/assets/cards/ai/AI 1 - purple cover - 2 qty.png',
    tags: ['ai'],
    qty: 2,
  },
]

export const cardById = (id) => CARDS.find((c) => c.id === id)

// МОК ЛОГИКИ: может ли карта выбирать цель. Канонично — атаки (значок молнии)
// целятся, релиз/поддержка/прочее — нет. Реально это решает логика друга;
// у нас это лишь признак, по которому включается прицеливание и подсветка.
export const cardCanTarget = (card) => !!card?.tags?.includes('lightning')

// МОК ЛОГИКИ комбо «две карты как одно действие» (Sudo / Code Review).
// Источник комбо — карта, которую играют вместе с партнёром.
export const isComboSource = (card) => !!card?.tags?.includes('combo-source')

// Валиден ли target как партнёр для source (что с чем сочетается).
// Sudo → карта с sudo-эффектом; Code Review → карта Release.
export const validComboTarget = (source, target) => {
  if (!source || !target || source.id === target.id) return false
  if (source.id === 'support-sudo') return !!target.tags?.includes('sudo')
  if (source.id === 'support-code-review') return target.category === 'release'
  return false
}
