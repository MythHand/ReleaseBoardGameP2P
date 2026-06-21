// Каталог карт = «сущности карт»: статические определения (арт + метаданные).
// Источник арта — public/assets/cards/. Имена/категории/теги считаны с самих артов.
// tags: lightning (атака), sudo (есть sudo-эффект), cancel/unicorn (тип защиты),
//       trigger, ai, combo-source (Sudo/Code Review).

/**
 * @typedef {Object} Card
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {'base'|'ai'} deck
 * @property {string} art
 * @property {string[]} tags
 * @property {number} qty
 */

// Resolve every card image bundled in this package to its final URL.
// import.meta.glob runs relative to THIS file, so consuming apps resolve the
// same assets without a duplicated public/ tree.
const ART = import.meta.glob('../assets/cards/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

// key like "cards/base/Release 3 - 4 qty.png" -> resolved URL
export const assetUrl = (key) => {
  const hit = ART[`../assets/${key}`]
  if (!hit) throw new Error(`Unknown card asset: ${key}`)
  return hit
}

export const COVERS = {
  base: assetUrl('cards/covers/Cover - base - 104 qty.png'),
  ai: assetUrl('cards/covers/Cover - ai - 21 qty.png'),
}

const B = (file) => assetUrl(`cards/base/${file}`)
const A = (file) => assetUrl(`cards/ai/${file}`)

/** @type {Card[]} */
export const CARDS = [
  // ===== Release =====
  { id: 'release-frontend', name: 'Frontend', category: 'release', deck: 'base', art: B('Release 3 - 4 qty.png'), tags: [], qty: 4 },
  { id: 'release-backend', name: 'Backend', category: 'release', deck: 'base', art: B('Release 2 - 4 qty.png'), tags: [], qty: 4 },
  { id: 'release-database', name: 'Database', category: 'release', deck: 'base', art: B('Release 1 - 5 qty.png'), tags: [], qty: 5 },

  // ===== Attack (значок молнии) =====
  { id: 'attack-security-bug', name: 'Security Bug', category: 'attack', deck: 'base', art: B('Attack 1 - 5 qty.png'), tags: ['lightning', 'sudo'], qty: 5 },
  { id: 'attack-ddos', name: 'DDoS', category: 'attack', deck: 'base', art: B('Attack 2 - 6 qty.png'), tags: ['lightning'], qty: 6 },
  { id: 'attack-bug', name: 'Bug', category: 'attack', deck: 'base', art: B('Attack 3 - 7 qty.png'), tags: ['lightning', 'sudo'], qty: 7 },
  { id: 'attack-legacy-code', name: 'Legacy Code', category: 'attack', deck: 'base', art: B('Attack 4 - 3 qty.png'), tags: ['lightning', 'sudo'], qty: 3 },
  { id: 'attack-out-of-memory', name: 'Out of Memory', category: 'attack', deck: 'base', art: B('Attack 5 - 2 qty.png'), tags: ['lightning', 'sudo'], qty: 2 },

  // ===== Defense (Cancel / Unicorn) =====
  { id: 'defense-not-a-bug', name: 'Not a Bug', category: 'defense', deck: 'base', art: B('Defense 1 - 2 qty.png'), tags: ['unicorn'], qty: 2 },
  { id: 'defense-works-on-my-machine', name: 'Works on my Machine', category: 'defense', deck: 'base', art: B('Defense 2 - 2 qty.png'), tags: ['unicorn'], qty: 2 },
  { id: 'defense-rollback', name: 'Rollback', category: 'defense', deck: 'base', art: B('Defense 3 - 3 qty.png'), tags: ['cancel', 'sudo'], qty: 3 },
  { id: 'defense-hotfix', name: 'Hotfix', category: 'defense', deck: 'base', art: B('Defense 4 - 3 qty.png'), tags: ['cancel'], qty: 3 },
  { id: 'defense-pr-approved', name: 'PR Approved', category: 'defense', deck: 'base', art: B('Defense 5 - 2 qty.png'), tags: ['cancel'], qty: 2 },
  { id: 'defense-rubber-ducky', name: 'Rubber Ducky', category: 'defense', deck: 'base', art: B('Defense 6 - 2 qty.png'), tags: ['cancel'], qty: 2 },

  // ===== Protection =====
  { id: 'protection-monitoring', name: 'Monitoring', category: 'protection', deck: 'base', art: B('Protection 1 - 4 qty.png'), tags: [], qty: 4 },
  { id: 'protection-debugger', name: 'Debugger', category: 'protection', deck: 'base', art: B('Protection 2 - 8 qty.png'), tags: [], qty: 8 },

  // ===== Operation (Git) =====
  { id: 'operation-system-upgrade', name: 'System Upgrade', category: 'operation', deck: 'base', art: B('Operation 1 - 2 qty.png'), tags: ['sudo'], qty: 2 },
  { id: 'operation-git-merge', name: 'Git Merge', category: 'operation', deck: 'base', art: B('Operation 2 - 2 qty.png'), tags: ['sudo'], qty: 2 },
  { id: 'operation-git-branch', name: 'Git Branch', category: 'operation', deck: 'base', art: B('Operation 3 - 3 qty.png'), tags: ['sudo'], qty: 3 },
  { id: 'operation-git-rebase', name: 'Git Rebase', category: 'operation', deck: 'base', art: B('Operation 4 - 3 qty.png'), tags: ['sudo'], qty: 3 },
  { id: 'operation-git-cherry-pick', name: 'Git Cherry-pick', category: 'operation', deck: 'base', art: B('Operation 5 - 3 qty.png'), tags: ['sudo'], qty: 3 },

  // ===== Support =====
  { id: 'support-sudo', name: 'Sudo', category: 'support', deck: 'base', art: B('Support 1 - 5 qty.png'), tags: ['combo-source'], qty: 5 },
  { id: 'support-code-review', name: 'Code Review', category: 'support', deck: 'base', art: B('Support 2 - 5 qty.png'), tags: ['combo-source'], qty: 5 },

  // ===== Trigger =====
  { id: 'trigger-error-503', name: 'Error 503', category: 'trigger', deck: 'base', art: B('Trigger - 7 qty.png'), tags: ['trigger'], qty: 7 },
  { id: 'trigger-ai', name: 'AI', category: 'trigger', deck: 'base', art: B('Trigger - 12 qty.png'), tags: ['trigger'], qty: 12 },

  // ===== AI / Events (фиолетовая колода) =====
  { id: 'ai-crush-database', name: 'Crush Database', category: 'ai', deck: 'ai', art: A('AI 1 - purple cover - 2 qty.png'), tags: ['ai'], qty: 2 },
  { id: 'ai-crush-frontend', name: 'Crush Frontend', category: 'ai', deck: 'ai', art: A('AI 2 - purple cover - 2 qty.png'), tags: ['ai'], qty: 2 },
  { id: 'ai-crush-backend', name: 'Crush Backend', category: 'ai', deck: 'ai', art: A('AI 3 - purple cover - 2 qty.png'), tags: ['ai'], qty: 2 },
  { id: 'ai-monitoring', name: 'AI Monitoring', category: 'ai', deck: 'ai', art: A('AI 4 - purple cover - 2 qty.png'), tags: ['ai'], qty: 2 },
  { id: 'ai-release-database', name: 'Release Database', category: 'ai', deck: 'ai', art: A('AI 5 - purple cover - 1 qty.png'), tags: ['ai'], qty: 1 },
  { id: 'ai-release-frontend', name: 'Release Frontend', category: 'ai', deck: 'ai', art: A('AI 6 - purple cover - 1 qty.png'), tags: ['ai'], qty: 1 },
  { id: 'ai-release-backend', name: 'Release Backend', category: 'ai', deck: 'ai', art: A('AI 7 - purple cover - 1 qty.png'), tags: ['ai'], qty: 1 },
  { id: 'ai-good-vibe-coding', name: 'Good Vibe-Coding', category: 'ai', deck: 'ai', art: A('AI 8 - purple cover - 3 qty.png'), tags: ['ai'], qty: 3 },
  { id: 'ai-bad-vibe-coding', name: 'Bad Vibe-Coding', category: 'ai', deck: 'ai', art: A('AI 9 - purple cover - 2 qty.png'), tags: ['ai'], qty: 2 },
  { id: 'ai-hallucination', name: 'Hallucination', category: 'ai', deck: 'ai', art: A('AI 10 - purple cover - 2 qty.png'), tags: ['ai'], qty: 2 },
  { id: 'ai-inside', name: 'Inside', category: 'ai', deck: 'ai', art: A('AI 11 - purple cover - 2 qty.png'), tags: ['ai'], qty: 2 },
  { id: 'ai-error-503', name: 'Error 503', category: 'ai', deck: 'ai', art: A('AI 12 - purple cover - 1 qty.png'), tags: ['ai'], qty: 1 },
]

export const cardById = (id) => CARDS.find((c) => c.id === id)

// МОК ЛОГИКИ: может ли карта выбирать цель (атаки — да). Реально решает логика друга.
export const cardCanTarget = (card) => !!card?.tags?.includes('lightning')

// МОК ЛОГИКИ комбо «две карты как одно действие» (Sudo / Code Review).
export const isComboSource = (card) => !!card?.tags?.includes('combo-source')

export const validComboTarget = (source, target) => {
  if (!source || !target || source.id === target.id) return false
  if (source.id === 'support-sudo') return !!target.tags?.includes('sudo')
  if (source.id === 'support-code-review') return target.category === 'release'
  return false
}
