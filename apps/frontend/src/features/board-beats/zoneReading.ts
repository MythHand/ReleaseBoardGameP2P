// HOW A CARD READS IN A RELEASE ZONE — asked of the slot it is flying into.
//
// The zone decides it (an opponent's `Seat` hands its zone `lod`: somebody
// else's zone is furniture, read at a glance) and says so on every slot. A
// flight into that slot hands its carrier the same reading at takeoff, so the
// card rebuilds itself over the flight and lands already reading the way its
// place does — handed over on landing instead, it pops (`useFlyer`'s `lod`).
//
// Asked of the slot rather than worked out from whose zone it is: three flights
// land in a zone — a release, an AI card, a stolen release — and two of them
// had each written "not ours, so at a glance" for themselves while the third,
// the release, had not, so an opponent's release landed in full and changed its
// reading on the last frame (#168).
export const readsAtGlance = (slot: Element | null | undefined): boolean =>
  slot instanceof HTMLElement && slot.dataset.lod === 'true'
