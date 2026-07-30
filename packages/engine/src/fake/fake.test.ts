import { describeEngine } from '../conformance'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'

// Every implementation runs the same suite. The fake's deck simply omits the
// cards whose UI surfaces the design defers, so nothing here needs gating.
describeEngine('fake', createFakeEngine, { deck: FAKE_DECK, events: FAKE_EVENTS })
