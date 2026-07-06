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

// Text shown on a composed card face. Minimal on purpose — fields are added as
// real cards are authored and we learn what each face actually needs.
export interface CardContent {
  // headline on the face (may differ per locale, e.g. transliterated names)
  title: string
  // type / category line under the title
  typeLine: string
  // main rules / effect text
  effect: string
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
export const CARD_CONTENT: Record<string, LocalizedCardContent> = {
  'release-frontend': {
    ru: {
      title: 'Frontend',
      typeLine: 'Release',
      effect: 'Выложите эту карту в свою зону релиза. Для этого сбросьте 1 карту из руки в сброс.',
    },
    en: {
      title: 'Frontend',
      typeLine: 'Release',
      effect: 'Place this card into your release zone. To do so, discard 1 card from your hand.',
    },
  },
}

// Convenience lookup — undefined until a card has authored content.
export const cardContentById = (id: string): LocalizedCardContent | undefined => CARD_CONTENT[id]
