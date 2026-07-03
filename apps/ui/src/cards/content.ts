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
  // sudo effect — rendered on a translucent yellow callout background
  highlight?: boolean
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
          highlight: true,
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
          highlight: true,
        },
      ],
    },
  },
}

// Convenience lookup — undefined until a card has authored content.
export const cardContentById = (id: string): LocalizedCardContent | undefined => CARD_CONTENT[id]
