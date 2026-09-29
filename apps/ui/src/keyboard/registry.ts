export const KEYBOARD_PRIORITY = { screen: 100, panel: 200, modal: 300 } as const
export type KeyResult = 'handled' | 'pass'
export type KeyFocus = 'non-interactive' | 'any' | ((event: KeyboardEvent) => boolean)
export interface KeyBinding {
  key: string
  run: (event: KeyboardEvent) => KeyResult
  enabled?: boolean
  focus?: KeyFocus
  repeat?: boolean
  modifiers?: 'none' | 'shift'
}
export interface KeyboardLayerOptions {
  name: string
  active: boolean
  priority: number
  bindings: readonly KeyBinding[]
  blockBelow?: boolean
  root?: () => HTMLElement | null
}
export interface KeyboardLayerState {
  isTopOfPriority: boolean
  stackIndex: number
}
export interface KeyboardLayerHandle {
  mount(options: KeyboardLayerOptions): () => void
  update(options: KeyboardLayerOptions): void
  subscribe(listener: () => void): () => void
  getSnapshot(): KeyboardLayerState
}
export interface KeyboardLayerInfo {
  name: string
  keys: readonly string[]
  priority: number
  activationOrder: number
  blockBelow: boolean
}
export interface KeyboardRegistry {
  createLayer(): KeyboardLayerHandle
  inspect(): readonly KeyboardLayerInfo[]
  topRoot(priority: number): HTMLElement | null
}

export const INACTIVE_LAYER: KeyboardLayerState = { isTopOfPriority: false, stackIndex: -1 }
const registries = new WeakMap<Window, KeyboardRegistry>()
const CONTROL = [
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  'summary',
  '[tabindex]',
  '[contenteditable]:not([contenteditable="false"])',
  ...[
    'button',
    'checkbox',
    'combobox',
    'grid',
    'gridcell',
    'link',
    'listbox',
    'menu',
    'menubar',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'radio',
    'radiogroup',
    'scrollbar',
    'searchbox',
    'slider',
    'spinbutton',
    'switch',
    'tab',
    'tablist',
    'textbox',
    'tree',
    'treeitem',
  ].map((role) => `[role="${role}"]`),
].join(',')

// Nodes may come from another window. The global Element constructor does not
// recognize those; the DOM node kind works across realms and shadow paths.
const elementOf = (target: EventTarget | null): Element | null =>
  target && 'nodeType' in target && target.nodeType === 1 ? (target as Element) : null

export function isKeyboardControl(event: KeyboardEvent): boolean {
  return [event.target, ...event.composedPath()].some((target) =>
    Boolean(elementOf(target)?.closest(CONTROL)),
  )
}

const matches = (binding: KeyBinding, event: KeyboardEvent) =>
  binding.enabled !== false &&
  binding.key === event.key &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  (!event.shiftKey || binding.modifiers === 'shift')

const consume = (event: KeyboardEvent) => {
  event.preventDefault()
  event.stopPropagation()
}

interface Entry {
  options: KeyboardLayerOptions | null
  order: number
  lease: number
  state: KeyboardLayerState
  subscribers: Set<() => void>
}

export function getKeyboardRegistry(owner: Window): KeyboardRegistry {
  const existing = registries.get(owner)
  if (existing) return existing
  const mounted = new Set<Entry>()
  let sequence = 0
  let listening = false
  const ordered = () =>
    [...mounted]
      .filter((entry) => entry.options?.active)
      .sort((a, b) => (b.options?.priority ?? 0) - (a.options?.priority ?? 0) || b.order - a.order)

  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
    // Take the whole event's view before invoking callbacks: a new layer opened
    // by this press only gets the next press, never the rest of this one.
    const layers = ordered().flatMap(({ options }) =>
      options
        ? [
            {
              ...options,
              bindings: [...options.bindings],
              element: options.root?.() ?? null,
            },
          ]
        : [],
    )
    for (const [index, layer] of layers.entries()) {
      for (const binding of layer.bindings) {
        if (!matches(binding, event)) continue
        const focus = binding.focus ?? 'non-interactive'
        if (
          typeof focus === 'function' ? !focus(event) : focus !== 'any' && isKeyboardControl(event)
        )
          continue
        if (event.repeat && !binding.repeat) {
          consume(event)
          return
        }
        if (binding.run(event) === 'handled') {
          consume(event)
          return
        }
      }
      if (layer.blockBelow) {
        // An overlay blocks global commands, not typing/button activation inside
        // it. Outside it, also stop the local/default action of a background control.
        const root = layer.element
        const inside =
          root &&
          event.composedPath().some((target) => {
            const el = elementOf(target)
            return el && root.contains(el)
          })
        if (
          !inside &&
          layers
            .slice(index + 1)
            .some((lower) => lower.bindings.some((binding) => matches(binding, event)))
        )
          consume(event)
        return
      }
    }
  }

  const refresh = (removed?: Entry) => {
    const active = ordered()
    if (active.length > 0 !== listening) {
      listening = active.length > 0
      if (listening) owner.addEventListener('keydown', onKey, true)
      else owner.removeEventListener('keydown', onKey, true)
    }
    const entries = removed ? [...mounted, removed] : [...mounted]
    const changed: Entry[] = []
    for (const entry of entries) {
      const peers = active.filter((peer) => peer.options?.priority === entry.options?.priority)
      const index = peers.indexOf(entry)
      const next =
        index < 0
          ? INACTIVE_LAYER
          : {
              isTopOfPriority: index === 0,
              stackIndex: peers.length - index - 1,
            }
      if (
        next.isTopOfPriority !== entry.state.isTopOfPriority ||
        next.stackIndex !== entry.state.stackIndex
      ) {
        entry.state = next
        changed.push(entry)
      }
    }
    // Publish all snapshots before notifying React or another subscriber.
    for (const entry of changed) for (const notify of entry.subscribers) notify()
  }

  const registry: KeyboardRegistry = {
    createLayer: () => {
      const entry: Entry = {
        options: null,
        order: 0,
        lease: 0,
        state: INACTIVE_LAYER,
        subscribers: new Set(),
      }
      const update = (options: KeyboardLayerOptions) => {
        if (options.active && !entry.options?.active) entry.order = ++sequence
        entry.options = options
        refresh()
      }
      return {
        mount: (options) => {
          const lease = ++entry.lease
          mounted.add(entry)
          update(options)
          return () => {
            if (lease !== entry.lease || !mounted.delete(entry)) return
            refresh(entry)
          }
        },
        update,
        subscribe: (listener) => {
          entry.subscribers.add(listener)
          return () => {
            entry.subscribers.delete(listener)
          }
        },
        getSnapshot: () => entry.state,
      }
    },
    inspect: () =>
      ordered().flatMap(({ options, order }) =>
        options
          ? [
              {
                name: options.name,
                keys: options.bindings
                  .filter((binding) => binding.enabled !== false)
                  .map((binding) => binding.key),
                priority: options.priority,
                activationOrder: order,
                blockBelow: Boolean(options.blockBelow),
              },
            ]
          : [],
      ),
    topRoot: (priority) =>
      ordered()
        .find((entry) => entry.options?.priority === priority)
        ?.options?.root?.() ?? null,
  }
  registries.set(owner, registry)
  return registry
}
