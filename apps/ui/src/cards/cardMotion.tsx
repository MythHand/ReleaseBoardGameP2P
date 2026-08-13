import { createContext, useContext } from 'react'

// Whether card faces follow the pointer. The tilt is a per-card prop
// (`useCardTilt({ tilt })`), but turning it off is a decision about a whole
// screen, not about one card — a player either wants the faces to move or does
// not, and threading a flag through the hand, the seats, the piles and the
// release zone would put a display preference into every one of their APIs.
//
// So it travels the way the face's language does (see ./cardLang): a consumer
// wraps its card-bearing subtree and the cards read it. Default `true` — the
// parallax is the designed behaviour, and a card without a provider keeps it.
//
// This switches the POINTER PARALLAX only. The hover lift stays: it answers
// "the cursor is on this card", which is feedback, not decoration.
const CardMotionContext = createContext(true)

export const CardMotionProvider = CardMotionContext.Provider
export const useCardMotion = () => useContext(CardMotionContext)
