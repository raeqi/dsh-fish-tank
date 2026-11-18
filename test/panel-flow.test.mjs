/**
 * End-to-end flow for the fish tank page in a DOM: render with token usage,
 * rerender when usage grows, feed by hand, reopen from browser storage,
 * surface starvation and the empty tank, and show a failed save. Uses the
 * checkout's jsdom, React and Testing Library; the shipped bundle has no
 * test-only hooks.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const checkout = '/Users/xingeng/Documents/dsh-creator-mode'
const pluginDir = path.dirname(path.dirname(new URL(import.meta.url).pathname))
const require = createRequire(path.join(checkout, 'package.json'))
const { JSDOM } = require('jsdom')
const libraryRequire = createRequire(require.resolve('@testing-library/react'))
const React = libraryRequire('react')
const pluginRequire = (name) => (name === 'react' ? React : libraryRequire(name))

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:3080/',
})
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.localStorage = dom.window.localStorage
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.Event = dom.window.Event
globalThis.MouseEvent = dom.window.MouseEvent
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const drawContext = new Proxy({}, {
  get(target, property) {
    if (property === 'createLinearGradient' || property === 'createRadialGradient') {
      return () => ({ addColorStop() {} })
    }
    if (property in target) return target[property]
    return () => {}
  },
  set(target, property, value) {
    target[property] = value
    return true
  },
})
window.devicePixelRatio = 2
window.HTMLCanvasElement.prototype.getContext = function () { return drawContext }
window.ResizeObserver = class {
  constructor(callback) { this.callback = callback }
  observe() { this.callback([]) }
  disconnect() {}
}
const frameQueue = []
window.requestAnimationFrame = callback => {
  frameQueue.push(callback)
  return frameQueue.length
}
window.cancelAnimationFrame = () => {}

const { render, fireEvent, screen, cleanup, act } = require('@testing-library/react')

let pendingFactory
window.__ModuleLoader__ = {
  load({ factory }) { pendingFactory = factory },
}

await import(pathToFileURL(path.join(pluginDir, 'client.js')).href)

const dictionaries = new Map()
const registrations = []
let activeLocale = 'en'
let activeListeners = []
let sessionState = null

function sessionsWith(total) {
  return {
    ids: ['s1'],
    byId: {
      s1: {
        id: 's1',
        projectionValues: {
          tokenUsage: {
            uncachedInputTokens: total,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
        },
      },
    },
    phase: 'ready',
    state: 'idle',
    projectionsBySession: {},
  }
}

function useSessions(selector) {
  return selector(sessionState)
}

function translate(namespace, key, params) {
  const dicts = dictionaries.get(namespace)
  const template = dicts?.[activeLocale]?.[key] ?? dicts?.en?.[key] ?? key
  return params === undefined
    ? template
    : template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
}

function install(locale = 'en') {
  for (const dispose of activeListeners) dispose()
  activeListeners = []
  activeLocale = locale
  registrations.length = 0
  frameQueue.length = 0
  const ctx = {
    locale: {
      bind: namespace => (key, params) => translate(namespace, key, params),
      register: (namespace, dicts) => {
        if (dictionaries.has(namespace)) throw new Error(`duplicate namespace ${namespace}`)
        dictionaries.set(namespace, dicts)
        return () => { dictionaries.delete(namespace) }
      },
    },
    effect: callback => {
      const disposer = callback()
      if (typeof disposer === 'function') activeListeners.push(disposer)
      return typeof disposer === 'function' ? disposer : () => {}
    },
    slots: {
      inject: (key, callback) => {
        registrations.push({ slot: key, ...callback() })
        return () => {}
      },
      register: (options, component) => ({ options, component }),
    },
  }
  const plugin = pendingFactory(pluginRequire)
  plugin.apply(ctx)
  const t = ctx.locale.bind('fishTank')
  const page = registrations.find(entry => entry.slot === 'main')
  const entry = registrations.find(item => item.slot === 'sidebar.panellist')
  return { t, page, entry }
}

function mount(registration, t) {
  return render(React.createElement(registration.component, { t, useSessions }))
}

function flushFrames(rounds = 2) {
  act(() => {
    for (let round = 0; round < rounds; round += 1) {
      const pending = frameQueue.splice(0)
      for (const callback of pending) callback()
    }
  })
}

function tankElement(container) {
  return container.querySelector('.dsw-fish-tank')
}

function stored(fish, overrides = {}) {
  return {
    version: 2,
    updatedAt: Date.now(),
    fish,
    reserve: 0,
    tokenSeen: {},
    tokensCounted: 0,
    tokenRemainder: 0,
    birthProgress: 0,
    lastBirthAt: 0,
    ...overrides,
  }
}

function fish(id, overrides = {}) {
  return {
    id, x: 0.5, y: 0.5, angle: 0, growth: 0.4, hunger: 0.9, hue: 30, starvingSince: null, ...overrides,
  }
}

localStorage.clear()
cleanup()

{
  sessionState = sessionsWith(120000)
  const { t, page, entry } = install()
  assert.ok(page, 'tank page registered into main')
  assert.ok(entry, 'sidebar entry registered')
  assert.equal(entry.options.id, 'fish-tank')
  assert.equal(entry.options.label(), 'Fish tank')

  const view = mount(page, t)
  flushFrames()
  assert.ok(screen.getByRole('heading', { name: 'Fish tank' }))
  assert.ok(screen.getByText('0 auto reserve'))
  assert.ok(screen.getByText(/0 tokens since the tank started/))
  assert.equal(screen.getByRole('button', { name: 'Feed' }).disabled, false)
  assert.ok(screen.getByText('Click the water to drop food too'))
  assert.ok(screen.getByText('Auto-fed 0 · hand-fed 0'))

  sessionState = sessionsWith(170000)
  act(() => {
    view.rerender(React.createElement(page.component, { t, useSessions }))
  })
  flushFrames()
  assert.ok(screen.getByText('5 auto reserve'))
  assert.ok(screen.getByText(/50,000 tokens since the tank started/))
  assert.equal(screen.getByRole('button', { name: 'Feed' }).disabled, false)
  assert.ok(screen.getByText('Click the water to drop food too'))

  fireEvent.click(screen.getByRole('button', { name: 'Feed' }))
  assert.ok(screen.getByText('5 auto reserve'), 'hand feeding is free')
  assert.ok(screen.getByText('Auto-fed 0 · hand-fed 3'))

  const tank = tankElement(view.container)
  tank.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 })
  fireEvent.click(tank, { clientX: 400, clientY: 120 })
  assert.ok(screen.getByText('5 auto reserve'), 'hand-dropped food is free')
  assert.ok(screen.getByText('Auto-fed 0 · hand-fed 4'))

  fireEvent.click(tank, { clientX: 400, clientY: 380 })
  assert.ok(screen.getByText('5 auto reserve'), 'food dropped on the sand is ignored')

  assert.ok(window.localStorage.getItem('dsh.fish-tank.v1') !== null)
  cleanup()
}

{
  sessionState = sessionsWith(170000)
  const { t, page } = install()
  const view = mount(page, t)
  flushFrames()
  assert.ok(screen.getByText('5 auto reserve'), 'the reserve survives a reopen')
  assert.ok(screen.getByText('Auto-fed 0 · hand-fed 4'), 'the hand-fed count survives a reopen')
  assert.ok(screen.getByText(/50,000 tokens since the tank started/))
  cleanup()
}

{
  localStorage.clear()
  sessionState = sessionsWith(100000)
  const { t, page } = install('zh')
  const view = mount(page, t)
  flushFrames()
  assert.ok(screen.getByRole('heading', { name: '鱼缸' }))
  assert.ok(screen.getByRole('button', { name: '投喂' }))
  assert.ok(screen.getByText(/每 10,000 token 攒 1 粒鱼食/))
  assert.ok(screen.getByText('0 粒自动储备'))
  assert.ok(screen.getByText('自动投喂 0 粒 · 手动投喂 0 粒'))
  cleanup()
}

{
  localStorage.clear()
  window.localStorage.setItem('dsh.fish-tank.v1', JSON.stringify(stored(
    [fish('f1'), fish('f2'), fish('f3')],
    { updatedAt: Date.now() - 5 * 86400 * 1000 },
  )))
  sessionState = sessionsWith(1000)
  const { t, page } = install()
  const view = mount(page, t)
  flushFrames()
  assert.ok(screen.getByRole('status'))
  assert.ok(screen.getByText('3 fish starved'))
  assert.ok(screen.getByText('The tank is empty'))
  assert.ok(screen.getByRole('button', { name: 'Add a fry' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add a fry' }))
  assert.ok(screen.getByText('1 fish'))
  cleanup()
}

{
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = {
    getItem: () => JSON.stringify(stored([fish('f1')], { reserve: 3 })),
    setItem: () => { throw new Error('quota exceeded') },
    removeItem: () => {},
    clear: () => {},
  }
  sessionState = sessionsWith(1000)
  const { t, page } = install()
  const view = mount(page, t)
  flushFrames()
  assert.ok(screen.getByRole('alert'), 'a failed save is visible')
  cleanup()
  globalThis.localStorage = originalStorage
}

console.log('fish tank UI flow: ok')
