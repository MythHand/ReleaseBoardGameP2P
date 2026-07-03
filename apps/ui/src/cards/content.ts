// Authored, localized copy for composed (parallax) card faces.
//
// Kept separate from catalogue.ts on purpose: catalogue.ts holds the static
// entity (art URL + metadata), while THIS file holds the hand-written display
// text that a composed face renders in place of a flat PNG. It grows card by
// card as that work proceeds — a card with no entry here simply has no composed
// content yet and falls back to its PNG face.
//
// @release/ui stays i18n-agnostic: this is DATA that carries BOTH locales side
// by side. The composed CardFace never reads a locale — the consumer picks one
// (`CARD_CONTENT[id][lang]`) and passes a single CardContent in as a prop.

// One paragraph of a card's description.
export interface CardParagraph {
  text: string
  // substrings of `text` to bold — names of other cards, or a sudo prefix
  bold?: string[]
  // callout background: 'sudo' = yellow (Git Operation sudo effect),
  // 'defense' = green (Defense "works against …", whole line bold)
  highlight?: 'sudo' | 'defense'
  // render `text` (e.g. "ИЛИ") as a centred divider — a thin rule to each side
  divider?: boolean
}

// Text shown on a composed card face. Minimal on purpose — fields are added as
// real cards are authored and we learn what each face actually needs.
export interface CardContent {
  // headline on the face (may differ per locale, e.g. transliterated names)
  title: string
  // type / category line under the title
  typeLine: string
  // description body — one or more paragraphs
  paragraphs: CardParagraph[]
  // optional flavour line
  flavor?: string
}

// Both locales for one card, authored together.
export interface LocalizedCardContent {
  ru: CardContent
  en: CardContent
}

// Keyed by Card.id (see catalogue.ts). Authored incrementally — start with the
// one representative card that validates the composed face, then fill the rest.
// Every Release card shares this effect text — only the title (card name) differs.
const RELEASE_EFFECT = {
  ru: 'Выложите эту карту в свою зону релиза. Для этого сбросьте 1 карту из руки в сброс.',
  en: 'Place this card into your release zone. To do so, discard 1 card from your hand.',
}
const releaseContent = (name: string): LocalizedCardContent => ({
  ru: { title: name, typeLine: 'Release', paragraphs: [{ text: RELEASE_EFFECT.ru }] },
  en: { title: name, typeLine: 'Release', paragraphs: [{ text: RELEASE_EFFECT.en }] },
})

// Unicorn Defense cards share the "cancel an attack" line and the green
// "works against a sudo attack" callout — only extra paragraphs differ.
const DEFENSE_UNICORN_CANCEL: Record<'ru' | 'en', CardParagraph> = {
  ru: {
    text: 'Отмените атаку Bug / Out of Memory / Legacy Code / Security Bug. Сбросьте обе карты.',
    bold: ['Bug', 'Out of Memory', 'Legacy Code', 'Security Bug'],
  },
  en: {
    text: 'Cancel a Bug / Out of Memory / Legacy Code / Security Bug attack. Discard both cards.',
    bold: ['Bug', 'Out of Memory', 'Legacy Code', 'Security Bug'],
  },
}
const DEFENSE_ANTI_SUDO: Record<'ru' | 'en', CardParagraph> = {
  ru: { text: 'Работает против sudo-атаки.', highlight: 'defense' },
  en: { text: 'Works against a sudo attack.', highlight: 'defense' },
}

// Cancel Defense cards (Hotfix, PR Approved, Rubber Ducky) share this single line.
const DEFENSE_CANCEL_DISCARD: Record<'ru' | 'en', CardParagraph> = {
  ru: {
    text: 'Отменяют атаку картами Bug, Out of Memory, Legacy Code или Security Bug. Обе карты сбрасываются.',
    bold: ['Bug', 'Out of Memory', 'Legacy Code', 'Security Bug'],
  },
  en: {
    text: 'Cancel an attack by Bug, Out of Memory, Legacy Code or Security Bug. Both cards are discarded.',
    bold: ['Bug', 'Out of Memory', 'Legacy Code', 'Security Bug'],
  },
}
const cancelDiscardContent = (name: string): LocalizedCardContent => ({
  ru: { title: name, typeLine: 'Defense / Cancel', paragraphs: [DEFENSE_CANCEL_DISCARD.ru] },
  en: { title: name, typeLine: 'Defense / Cancel', paragraphs: [DEFENSE_CANCEL_DISCARD.en] },
})

// Git Operation cards: a plain first line + a yellow sudo callout whose prefix
// "sudo <Name>:" is bold. `line`/`sudo` are the per-locale texts.
interface GitOpText {
  line: string
  sudo: string
}
const gitOpContent = (name: string, ru: GitOpText, en: GitOpText): LocalizedCardContent => {
  const face = (t: GitOpText): CardContent => ({
    title: name,
    typeLine: 'Git Operation',
    paragraphs: [
      { text: t.line },
      { text: `sudo ${name}: ${t.sudo}`, bold: [`sudo ${name}:`], highlight: 'sudo' },
    ],
  })
  return { ru: face(ru), en: face(en) }
}

// Attack cards defended only by Unicorn (Bug, Legacy Code, Out of Memory) share
// this body; only the title + sudo prefix ("sudo <Name>:") differ.
const ATTACK_UNICORN_BASE: Record<'ru' | 'en', CardParagraph[]> = {
  ru: [
    {
      text: 'Сразу после релиза противника: Сбросьте его Release вместе с этой картой.',
      bold: ['Release'],
    },
    { text: 'ИЛИ', divider: true },
    { text: 'Возьмите случайную карту из руки любого игрока.' },
  ],
  en: [
    {
      text: "Right after an opponent's release: discard their Release along with this card.",
      bold: ['Release'],
    },
    { text: 'OR', divider: true },
    { text: "Take a random card from any player's hand." },
  ],
}
const attackUnicornContent = (name: string): LocalizedCardContent => {
  const face = (base: CardParagraph[], sudo: string): CardContent => ({
    title: name,
    typeLine: 'Attack',
    paragraphs: [
      ...base,
      { text: `sudo ${name}: ${sudo}`, bold: [`sudo ${name}:`, 'Unicorn'], highlight: 'sudo' },
    ],
  })
  return {
    ru: face(ATTACK_UNICORN_BASE.ru, 'Защита возможна только картами Unicorn.'),
    en: face(ATTACK_UNICORN_BASE.en, 'Can only be defended with Unicorn cards.'),
  }
}

export const CARD_CONTENT: Record<string, LocalizedCardContent> = {
  'release-frontend': releaseContent('Frontend'),
  'release-backend': releaseContent('Backend'),
  'release-database': releaseContent('Database'),
  'protection-monitoring': {
    ru: {
      title: 'Monitoring',
      typeLine: 'Protection',
      paragraphs: [
        {
          text: 'Выложите эту карту в свою зону релиза (не более одной). Карта защищает от Error 503 и Crush. При доборе угроза сбрасывается, а Monitoring остаётся в зоне релиза.',
          bold: ['Error 503', 'Crush', 'Monitoring'],
        },
      ],
    },
    en: {
      title: 'Monitoring',
      typeLine: 'Protection',
      paragraphs: [
        {
          text: 'Place this card into your release zone (no more than one). It protects against Error 503 and Crush. On a draw the threat is discarded and Monitoring stays in the release zone.',
          bold: ['Error 503', 'Crush', 'Monitoring'],
        },
      ],
    },
  },
  'protection-debugger': {
    ru: {
      title: 'Debugger',
      typeLine: 'Protection',
      paragraphs: [
        {
          text: 'Разыграйте как защиту против Crush или Error 503. Обе карты отправляются в сброс.',
          bold: ['Crush', 'Error 503'],
        },
      ],
    },
    en: {
      title: 'Debugger',
      typeLine: 'Protection',
      paragraphs: [
        {
          text: 'Play as a defense against Crush or Error 503. Both cards go to the discard pile.',
          bold: ['Crush', 'Error 503'],
        },
      ],
    },
  },
  'operation-system-upgrade': {
    ru: {
      title: 'System Upgrade',
      typeLine: 'Git Operation',
      paragraphs: [
        { text: 'Все остальные игроки скидывают по одной карте из своей руки в сброс.' },
        {
          text: 'sudo System Upgrade: Выберите одну из сброшенных карт и возьмите её себе в руку.',
          bold: ['sudo System Upgrade:'],
          highlight: 'sudo',
        },
      ],
    },
    en: {
      title: 'System Upgrade',
      typeLine: 'Git Operation',
      paragraphs: [
        { text: 'Every other player discards one card from their hand.' },
        {
          text: 'sudo System Upgrade: Choose one of the discarded cards and take it into your hand.',
          bold: ['sudo System Upgrade:'],
          highlight: 'sudo',
        },
      ],
    },
  },
  'operation-git-branch': gitOpContent(
    'Git Branch',
    {
      line: 'Разделите одну из колод добора на две колоды.',
      sudo: 'Переверните сброс и используйте его как новую колоду добора (не перемешивайте карты).',
    },
    {
      line: 'Split one of the draw decks into two decks.',
      sudo: 'Flip the discard pile and use it as a new draw deck (do not shuffle the cards).',
    },
  ),
  'operation-git-merge': gitOpContent(
    'Git Merge',
    {
      line: 'Объедините все колоды добора в одну и перетасуйте их.',
      sudo: 'Добавьте сброс к новой колоде и перетасуйте.',
    },
    {
      line: 'Merge all draw decks into one and shuffle them.',
      sudo: 'Add the discard pile to the new deck and shuffle.',
    },
  ),
  'operation-git-rebase': gitOpContent(
    'Git Rebase',
    {
      line: 'Посмотрите три верхние карты из одной колоды добора и измените их порядок по своему усмотрению.',
      sudo: 'Примените эффект ко всем колодам добора в игре.',
    },
    {
      line: 'Look at the top three cards of one draw deck and reorder them as you wish.',
      sudo: 'Apply the effect to every draw deck in the game.',
    },
  ),
  'operation-git-cherry-pick': gitOpContent(
    'Git Cherry-pick',
    {
      line: 'Выберите одну карту из всего сброса и заберите её в свою руку.',
      sudo: 'Выберите две карты из сброса — одну возьмите в руку, вторую положите наверх колоды добора.',
    },
    {
      line: 'Choose one card from the entire discard pile and take it into your hand.',
      sudo: 'Choose two cards from the discard pile — take one into your hand, put the other on top of the draw deck.',
    },
  ),
  'defense-not-a-bug': {
    ru: {
      title: 'Not a Bug',
      typeLine: 'Defense / Unicorn',
      paragraphs: [DEFENSE_UNICORN_CANCEL.ru, DEFENSE_ANTI_SUDO.ru],
    },
    en: {
      title: 'Not a Bug',
      typeLine: 'Defense / Unicorn',
      paragraphs: [DEFENSE_UNICORN_CANCEL.en, DEFENSE_ANTI_SUDO.en],
    },
  },
  'defense-works-on-my-machine': {
    ru: {
      // hand-tuned wrap: nbsp glues "Works on" and "my Machine", so the only
      // break point is the middle space → "Works on" / "my Machine"
      title: 'Works on my Machine',
      typeLine: 'Defense / Unicorn',
      paragraphs: [
        DEFENSE_UNICORN_CANCEL.ru,
        DEFENSE_ANTI_SUDO.ru,
        { text: 'Эффект атакующей карты оборачивается против самого атакующего.' },
      ],
    },
    en: {
      // hand-tuned wrap: nbsp glues "Works on" and "my Machine", so the only
      // break point is the middle space → "Works on" / "my Machine"
      title: 'Works on my Machine',
      typeLine: 'Defense / Unicorn',
      paragraphs: [
        DEFENSE_UNICORN_CANCEL.en,
        DEFENSE_ANTI_SUDO.en,
        { text: 'The attacking card’s effect is turned back against the attacker.' },
      ],
    },
  },
  'defense-rollback': {
    ru: {
      title: 'Rollback',
      typeLine: 'Defense / Cancel',
      paragraphs: [
        {
          text: 'Отменяют атаку картами Bug, Out of Memory, Legacy Code или Security Bug. Эта карта сбрасывается. Карта атаки возвращается в руку атакующего — он не сможет сыграть её снова до своего следующего хода.',
          bold: ['Bug', 'Out of Memory', 'Legacy Code', 'Security Bug'],
        },
        {
          text: 'sudo Rollback: Заберите атакующую карту в свою руку.',
          bold: ['sudo Rollback:'],
          highlight: 'sudo',
        },
      ],
    },
    en: {
      title: 'Rollback',
      typeLine: 'Defense / Cancel',
      paragraphs: [
        {
          text: "Cancel an attack by Bug, Out of Memory, Legacy Code or Security Bug. This card is discarded. The attack card returns to the attacker's hand — they can't play it again until their next turn.",
          bold: ['Bug', 'Out of Memory', 'Legacy Code', 'Security Bug'],
        },
        {
          text: 'sudo Rollback: Take the attacking card into your hand.',
          bold: ['sudo Rollback:'],
          highlight: 'sudo',
        },
      ],
    },
  },
  'defense-hotfix': cancelDiscardContent('Hotfix'),
  'defense-pr-approved': cancelDiscardContent('PR Approved'),
  'defense-rubber-ducky': cancelDiscardContent('Rubber Ducky'),
  'attack-security-bug': {
    ru: {
      title: 'Security Bug',
      typeLine: 'Attack',
      paragraphs: [
        {
          text: 'Сразу после релиза противника: Переместите Release в вашу зону релиза.',
          bold: ['Release'],
        },
        { text: 'ИЛИ', divider: true },
        {
          text: 'Запросите определенную карту из руки любого игрока — заберите если карта есть (иначе ничего).',
        },
        {
          text: 'sudo Security Bug: Защита возможна только картами Unicorn.',
          bold: ['sudo Security Bug:', 'Unicorn'],
          highlight: 'sudo',
        },
      ],
    },
    en: {
      title: 'Security Bug',
      typeLine: 'Attack',
      paragraphs: [
        {
          text: "Right after an opponent's release: move a Release into your release zone.",
          bold: ['Release'],
        },
        { text: 'OR', divider: true },
        {
          text: 'Name a specific card from any player’s hand — take it if they have it (otherwise nothing).',
        },
        {
          text: 'sudo Security Bug: Can only be defended with Unicorn cards.',
          bold: ['sudo Security Bug:', 'Unicorn'],
          highlight: 'sudo',
        },
      ],
    },
  },
  'attack-ddos': {
    ru: {
      title: 'DDoS',
      typeLine: 'Attack',
      paragraphs: [
        {
          text: 'Уничтожьте Monitoring / AI Monitoring противника, сбросьте обе карты (AI Monitoring возвращается в AI-колоду).',
          bold: ['Monitoring', 'AI Monitoring'],
        },
        { text: 'ИЛИ', divider: true },
        {
          text: 'На Release игрока: верните владельцу в руку (заморожена на один ход); На AI Release: возвращается в AI-колоду.',
          bold: ['Release', 'AI Release'],
        },
      ],
    },
    en: {
      title: 'DDoS',
      typeLine: 'Attack',
      paragraphs: [
        {
          text: "Destroy an opponent's Monitoring / AI Monitoring, discard both cards (AI Monitoring returns to the AI deck).",
          bold: ['Monitoring', 'AI Monitoring'],
        },
        { text: 'OR', divider: true },
        {
          text: "On a player's Release: return it to the owner's hand (frozen for one turn); on an AI Release: it returns to the AI deck.",
          bold: ['Release', 'AI Release'],
        },
      ],
    },
  },
  'attack-bug': attackUnicornContent('Bug'),
  'attack-legacy-code': attackUnicornContent('Legacy Code'),
  'attack-out-of-memory': attackUnicornContent('Out of Memory'),
  'support-sudo': {
    ru: {
      title: 'Sudo',
      typeLine: 'Support',
      paragraphs: [
        {
          text: 'Разыграйте с картой, имеющей sudo эффект. Активирует это усиление.',
          highlight: 'sudo',
        },
      ],
    },
    en: {
      title: 'Sudo',
      typeLine: 'Support',
      paragraphs: [
        {
          text: 'Play together with a card that has a sudo effect. Activates that boost.',
          highlight: 'sudo',
        },
      ],
    },
  },
  'support-code-review': {
    ru: {
      title: 'Code Review',
      typeLine: 'Support',
      paragraphs: [
        {
          text: 'Разыграйте одновременно с картой Release. Делает Release неуязвимой к атакам Bug, Out of Memory, Legacy Code или Security Bug (даже с sudo-усилением).',
          bold: ['Release', 'Bug', 'Out of Memory', 'Legacy Code', 'Security Bug'],
        },
      ],
    },
    en: {
      title: 'Code Review',
      typeLine: 'Support',
      paragraphs: [
        {
          text: 'Play together with a Release card. Makes the Release immune to Bug, Out of Memory, Legacy Code or Security Bug attacks (even with a sudo boost).',
          bold: ['Release', 'Bug', 'Out of Memory', 'Legacy Code', 'Security Bug'],
        },
      ],
    },
  },
}

// Convenience lookup — undefined until a card has authored content.
export const cardContentById = (id: string): LocalizedCardContent | undefined => CARD_CONTENT[id]
