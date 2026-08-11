import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import type { HistoryLabels } from '~/entities/game/board'

// The board page reads these through i18next's `t()`, which returns `unknown`
// and is cast to `HistoryLabels` — so a member of the engine's `Event` union
// with no label compiles cleanly and renders a blank row in the move history.
// That is the same shape as the missing `pending`/`window` copy that deadlocked
// the board: complete types, absent data, silent at every layer.
//
// Reading the catalogs directly is the one place the keys are literal enough to
// check, so a missing label fails here at typecheck instead of on the table.
// `satisfies` rather than a cast: a cast is what hid the problem.
enCommon.historyLabels satisfies HistoryLabels
ruCommon.historyLabels satisfies HistoryLabels
