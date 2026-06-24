// Набор ников для кнопки «рандомный ник» (MVP). Бренд-нейтральные,
// в дев-стилистике, латиница/цифры — проходят через тот же санитайзер.
export const NICKNAMES = [
  'PixelPenguin',
  'ByteWrangler',
  'CtrlAltDefeat',
  'NullNinja',
  'SudoNomad',
  'LoopGoblin',
  'CacheCowboy',
  'RubberDuck',
  'MergeGremlin',
  'KernelPanda',
  'CommitCrab',
  'BugWhisperer',
  'TabsOverSpaces',
  'QuantumYak',
  'LazyLoader',
  'SyntaxSeagull',
  'PingPanther',
  'DiskDoctor',
  'HeapHopper',
  'FizzBuzzard',
] as const

// Случайный ник из набора.
export function randomNickname(): string {
  return NICKNAMES[Math.floor(Math.random() * NICKNAMES.length)] ?? NICKNAMES[0]
}

// Ник: только латиница, цифры и безопасные символы _ . -
export function sanitizeNickname(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, '')
}
