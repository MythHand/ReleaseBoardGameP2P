import { KEYBOARD_PRIORITY, useKeyboardLayer } from '@release/ui'

interface BoardKeyAction {
  active: boolean
  run: () => void
}
interface BoardKeyboardOptions {
  panel: BoardKeyAction
  defense: BoardKeyAction
  staged: BoardKeyAction
  opening: BoardKeyAction
}
export function useBoardKeyboard({ panel, defense, staged, opening }: BoardKeyboardOptions): void {
  useKeyboardLayer({
    name: 'board-panel',
    active: panel.active,
    priority: KEYBOARD_PRIORITY.panel,
    bindings: [
      {
        key: 'Escape',
        focus: 'any',
        run: () => {
          panel.run()
          return 'handled'
        },
      },
    ],
  })
  const action = [defense, staged, opening].find((candidate) => candidate.active)
  useKeyboardLayer({
    name: 'board',
    active: Boolean(action),
    priority: KEYBOARD_PRIORITY.screen,
    bindings: [
      {
        key: 'Escape',
        focus: 'any',
        run: () => {
          action?.run()
          return 'handled'
        },
      },
    ],
  })
}
