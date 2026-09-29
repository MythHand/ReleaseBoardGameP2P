import { getKeyboardRegistry, type KeyboardLayerOptions } from './registry'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

const key = (target: EventTarget = document.body, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}
const layer = (options: Partial<KeyboardLayerOptions> = {}, owner: Window = window) => {
  const run = vi.fn(() => 'handled' as const)
  const config: KeyboardLayerOptions = {
    name: 'screen',
    active: true,
    priority: 100,
    bindings: [{ key: 'Escape', focus: 'any', run }],
    ...options,
  }
  const handle = getKeyboardRegistry(owner).createLayer()
  const unmount = handle.mount(config)
  disposers.push(unmount)
  return { handle, config, run, unmount }
}

it('dispatches by priority, then by latest activation, without promoting updates', () => {
  const modal = layer({ priority: 300 })
  const screen = layer()
  key()
  expect(modal.run).toHaveBeenCalledTimes(1)
  expect(screen.run).not.toHaveBeenCalled()
  const newer = layer({ priority: 300 })
  modal.handle.update({ ...modal.config, name: 'updated' })
  key()
  expect(newer.run).toHaveBeenCalledTimes(1)
  modal.handle.update({ ...modal.config, active: false })
  modal.handle.update(modal.config)
  key()
  expect(modal.run).toHaveBeenCalledTimes(2)
})

it('passes explicitly and stops both default and DOM propagation once handled', () => {
  const screen = layer()
  const pass = vi.fn(() => 'pass' as const)
  layer({ priority: 200, bindings: [{ key: 'Escape', run: pass }] })
  const local = vi.fn()
  document.body.addEventListener('keydown', local, { once: true })
  const event = key()
  expect(pass).toHaveBeenCalledTimes(1)
  expect(screen.run).toHaveBeenCalledTimes(1)
  expect(local).not.toHaveBeenCalled()
  expect(event.defaultPrevented).toBe(true)
  document.body.removeEventListener('keydown', local)
})

it('ignores inactive and disabled bindings', () => {
  const screen = layer()
  const inactive = layer({ priority: 300, active: false })
  const disabled = vi.fn(() => 'handled' as const)
  layer({ priority: 200, bindings: [{ key: 'Escape', enabled: false, run: disabled }] })
  key()
  expect(screen.run).toHaveBeenCalledTimes(1)
  expect(inactive.run).not.toHaveBeenCalled()
  expect(disabled).not.toHaveBeenCalled()
})

it('takes a dispatch snapshot when a handler removes itself and opens another layer', () => {
  const screen = layer()
  let opened: ReturnType<typeof layer> | undefined
  const top = layer({
    priority: 300,
    bindings: [
      {
        key: 'Escape',
        run: () => {
          top.unmount()
          opened = layer({ priority: 400 })
          return 'handled'
        },
      },
    ],
  })
  key()
  expect(screen.run).not.toHaveBeenCalled()
  expect(opened?.run).not.toHaveBeenCalled()
  key()
  expect(opened?.run).toHaveBeenCalledTimes(1)
})

it('owns one capture listener and removes it after the last active layer leaves', () => {
  const add = vi.spyOn(window, 'addEventListener')
  const remove = vi.spyOn(window, 'removeEventListener')
  const a = layer()
  const b = layer()
  expect(add.mock.calls.filter(([name]) => name === 'keydown')).toHaveLength(1)
  expect(add.mock.calls.find(([name]) => name === 'keydown')?.[2]).toBe(true)
  a.unmount()
  expect(remove.mock.calls.filter(([name]) => name === 'keydown')).toHaveLength(0)
  b.handle.update({ ...b.config, active: false })
  expect(remove.mock.calls.filter(([name]) => name === 'keydown')).toHaveLength(1)
})

it('retains a handle order through effect replay and produces stable compact snapshots', () => {
  const a = layer({ priority: 300 })
  const b = layer({ priority: 300 })
  const snapshot = b.handle.getSnapshot()
  b.handle.update({ ...b.config, name: 'changed' })
  expect(b.handle.getSnapshot()).toBe(snapshot)
  expect(snapshot).toEqual({ isTopOfPriority: true, stackIndex: 1 })
  a.unmount()
  const unmountAgain = a.handle.mount(a.config)
  disposers.push(unmountAgain)
  key()
  expect(b.run).toHaveBeenCalledTimes(1)
  expect(a.run).not.toHaveBeenCalled()
  unmountAgain()
  expect(b.handle.getSnapshot()).toEqual({ isTopOfPriority: true, stackIndex: 0 })
})

it.each([
  'input',
  'textarea',
  'select',
  'button',
  'a',
  'summary',
  'editable',
  'tabindex',
  'role',
])('leaves %s controls to their local handlers', (kind) => {
  const el = document.createElement(['editable', 'tabindex', 'role'].includes(kind) ? 'div' : kind)
  if (kind === 'a') el.setAttribute('href', '#')
  if (kind === 'editable') el.setAttribute('contenteditable', 'true')
  if (kind === 'tabindex') el.setAttribute('tabindex', '0')
  if (kind === 'role') el.setAttribute('role', 'slider')
  const child = document.createElement('span')
  el.append(child)
  document.body.append(el)
  const run = vi.fn(() => 'handled' as const)
  layer({ bindings: [{ key: ' ', run }] })
  expect(key(child, { key: ' ' }).defaultPrevented).toBe(false)
  expect(run).not.toHaveBeenCalled()
})

it('recognizes editable nodes inside a shadow event path', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const input = document.createElement('input')
  host.attachShadow({ mode: 'open' }).append(input)
  const run = vi.fn(() => 'handled' as const)
  layer({ bindings: [{ key: ' ', run }] })
  expect(key(input, { key: ' ' }).defaultPrevented).toBe(false)
  expect(run).not.toHaveBeenCalled()
})

it('isolates windows and recognizes controls from their own realm', () => {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const owner = frame.contentWindow
  if (!owner) throw new Error('iframe has no window')
  const outer = layer()
  const inner = layer({}, owner)
  key(owner.document.body)
  expect(inner.run).toHaveBeenCalledTimes(1)
  expect(outer.run).not.toHaveBeenCalled()
  const input = owner.document.createElement('input')
  owner.document.body.append(input)
  inner.handle.update({ ...inner.config, bindings: [{ key: ' ', run: inner.run }] })
  key(input, { key: ' ' })
  expect(inner.run).toHaveBeenCalledTimes(1)
})

it.each([
  { altKey: true },
  { ctrlKey: true },
  { metaKey: true },
  { shiftKey: true },
  { isComposing: true },
  { keyCode: 229 },
])('ignores reserved/composing key: %j', (init) => {
  const current = layer()
  expect(key(document.body, init).defaultPrevented).toBe(false)
  expect(current.run).not.toHaveBeenCalled()
})

it('honors already prevented events, allows explicit Tab repeat and consumes Escape repeats', () => {
  const current = layer()
  expect(key(document.body, { repeat: true }).defaultPrevented).toBe(true)
  expect(current.run).not.toHaveBeenCalled()
  const prevented = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
  prevented.preventDefault()
  window.dispatchEvent(prevented)
  expect(current.run).not.toHaveBeenCalled()
  current.handle.update({
    ...current.config,
    bindings: [{ key: 'Tab', modifiers: 'shift', repeat: true, run: current.run }],
  })
  key(document.body, { key: 'Tab', shiftKey: true, repeat: true })
  expect(current.run).toHaveBeenCalledTimes(1)
})

it('blocks background shortcuts but preserves local controls inside a modal root', () => {
  const dialog = document.createElement('div')
  const inside = document.createElement('input')
  dialog.append(inside)
  const outside = document.createElement('button')
  document.body.append(dialog, outside)
  const run = vi.fn(() => 'handled' as const)
  layer({ bindings: [{ key: ' ', run }] })
  layer({ name: 'modal', priority: 300, blockBelow: true, root: () => dialog, bindings: [] })
  expect(key(inside, { key: ' ' }).defaultPrevented).toBe(false)
  expect(key(outside, { key: ' ' }).defaultPrevented).toBe(true)
  expect(run).not.toHaveBeenCalled()
  expect(getKeyboardRegistry(window).topRoot(300)).toBe(dialog)
  expect(
    getKeyboardRegistry(window)
      .inspect()
      .map(({ name, keys }) => ({ name, keys })),
  ).toEqual([
    { name: 'modal', keys: [] },
    { name: 'screen', keys: [' '] },
  ])
})
