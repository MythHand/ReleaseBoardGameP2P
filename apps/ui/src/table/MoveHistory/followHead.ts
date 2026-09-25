// How far from the top still counts as "at the head" — about two rows, so a
// fractional scroll position or a part-rendered row does not stop the follow.
export const FOLLOW_SLACK = 48

/**
 * Whether the reader is at the head of the log. It reads newest-first, so an
 * arriving entry lands at the top — but only a reader who is already there
 * wants to be carried along. One scrolled down is reading older rows, and
 * moving the page under them is worse than letting the new row wait.
 */
export function atHead(el: HTMLElement, slack: number = FOLLOW_SLACK): boolean {
  return el.scrollTop < slack
}
