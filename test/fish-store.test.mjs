/**
 * Tank simulation behavior: token intake, reserve feeding, growth, breeding,
 * starvation, the closed-window catch-up, and persistence. Runs the shipped
 * `client.js` in a Node VM and calls the page global it defines, so the test
 * exercises the same code the browser loads.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')

function loadBundle() {
  const registrations = []
  const context = {
    window: { __ModuleLoader__: { load: registration => registrations.push(registration) } },
    console,
  }
  vm.createContext(context)
  vm.runInContext(source, context, { filename: 'client.js' })
  assert.equal(registrations.length, 1, 'one bundle registration')
  return { tank: context.DshFishTank, registration: registrations[0] }
}

function memoryStorage() {
  const entries = new Map()
  return {
    getItem: key => (entries.has(key) ? entries.get(key) : null),
    setItem: (key, value) => { entries.set(key, String(value)) },
    removeItem: key => { entries.delete(key) },
    entries,
  }
}

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function clock(start) {
  let current = start
  return { now: () => current, advance: ms => { current += ms } }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function fish(id, overrides = {}) {
  return {
    id,
    x: 0.5,
    y: 0.5,
    angle: 0.1,
    growth: 0.4,
    hunger: 0.5,
    hue: 30,
    starvingSince: null,
    ...overrides,
  }
}

function stored(overrides = {}) {
  return {
    version: 2,
    updatedAt: 1000,
    fish: [fish('f1'), fish('f2'), fish('f3')],
    reserve: 0,
    tokenSeen: {},
    tokensCounted: 0,
    tokenRemainder: 0,
    autoFed: 0,
    manualFed: 0,
    birthProgress: 0,
    lastBirthAt: 0,
    ...overrides,
  }
}

function preload(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const first = loadBundle()
const { tank } = first
const STORAGE_KEY = tank.STORAGE_KEY

test('the bundle registers the package id and exposes the plugin contract', () => {
  assert.equal(first.registration.id, '@local/dsh-fish-tank')
  const plugin = first.registration.factory(() => ({ createElement: () => null }))
  assert.deepEqual(plain(Object.keys(plugin).sort()), ['apply', 'inject'])
  assert.deepEqual(plain(plugin.inject), ['slots', 'locale'])
})

test('token usage sums every billed bucket and ignores unknown values', () => {
  assert.equal(tank.usageTotal({
    uncachedInputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4,
  }), 10)
  assert.equal(tank.usageTotal({ uncachedInputTokens: 5 }), 5)
  assert.equal(tank.usageTotal(null), 0)
})

test('a fresh tank holds three fish with no reserve', () => {
  const clockAt = clock(1000)
  const store = tank.createStore({ storage: memoryStorage(), now: clockAt.now, random: seeded(7) })
  const summary = store.summary()
  assert.equal(summary.fish, 3)
  assert.equal(summary.reserve, 0)
  assert.equal(summary.tokens, 0)
  assert.equal(summary.autoFed, 0)
  assert.equal(summary.manualFed, 0)
  assert.equal(store.isReady(), false)
  store.catchUp(clockAt.now())
  assert.equal(store.isReady(), true)
  for (const current of store.getFish()) {
    assert.ok(current.x >= 0.05 && current.x <= 0.95)
    assert.ok(current.y >= 0.08 && current.y <= 0.84)
  }
})

test('historical usage is a baseline; only later growth becomes food', () => {
  const clockAt = clock(1000)
  const store = tank.createStore({ storage: memoryStorage(), now: clockAt.now, random: seeded(11) })
  const baseline = store.absorbTokens([{ id: 's1', total: 500000 }])
  assert.deepEqual(plain(baseline), { pellets: 0, tokens: 0 })
  assert.deepEqual(plain(store.absorbTokens([{ id: 's1', total: 500000 }])), { pellets: 0, tokens: 0 })
  assert.equal(store.absorbTokens([{ id: 's1', total: 510000 }]).pellets, 1)
  assert.equal(store.summary().reserve, 1)
  assert.equal(store.absorbTokens([{ id: 's1', total: 515000 }]).pellets, 0)
  assert.equal(store.absorbTokens([{ id: 's1', total: 520000 }]).pellets, 1)
  assert.equal(store.summary().tokens, 20000)
})

test('hand feeding never spends the automatic reserve', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({ reserve: 5 }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(13) })
  store.catchUp(clockAt.now())
  assert.equal(store.feed(), tank.MANUAL_FEED)
  assert.equal(store.summary().reserve, 5)
  assert.equal(store.summary().pellets, tank.MANUAL_FEED)
  assert.equal(store.summary().manualFed, tank.MANUAL_FEED)
  assert.equal(store.summary().autoFed, 0)
  assert.equal(store.feed(), tank.MANUAL_FEED)
  assert.equal(store.summary().reserve, 5)
  assert.equal(store.summary().pellets, tank.MANUAL_FEED * 2)
  assert.equal(store.summary().manualFed, tank.MANUAL_FEED * 2)
})

test('hand feeding works with no automatic reserve at all', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({ reserve: 0 }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(15) })
  store.catchUp(clockAt.now())
  assert.equal(store.feed(), tank.MANUAL_FEED)
  assert.equal(store.summary().reserve, 0)
  assert.equal(store.summary().pellets, tank.MANUAL_FEED)
  assert.equal(store.summary().manualFed, tank.MANUAL_FEED)
})

test('hand-dropped food never spends the automatic reserve', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({ reserve: 2 }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(17) })
  store.catchUp(clockAt.now())
  assert.equal(store.dropFood(0.5, 0.3), true)
  assert.equal(store.summary().reserve, 2)
  assert.equal(store.dropFood(0.6, 0.2), true)
  assert.equal(store.dropFood(Number.NaN, 0.5), false)
  assert.equal(store.summary().manualFed, 2)
})

test('a hungry fish eats a pellet and grows', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({ reserve: 1, fish: [fish('f1', { hunger: 0.8, growth: 0.3 })] }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(19) })
  store.catchUp(clockAt.now())
  const before = store.getFish()[0]
  assert.equal(store.dropFood(before.x, before.y), true)
  const events = store.step(clockAt.now() + 16)
  assert.equal(events.ate, 1)
  assert.equal(store.summary().pellets, 0)
  const after = store.getFish()[0]
  assert.ok(after.hunger < before.hunger)
  assert.ok(after.growth > before.growth)
})

test('hunger advances over real time', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({
    updatedAt: clockAt.now() - 12 * 3600 * 1000,
    fish: [fish('f1', { hunger: 0.2 })],
  }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(23) })
  store.catchUp(clockAt.now())
  const hunger = store.summary().hunger
  assert.ok(hunger > 0.68 && hunger < 0.72, `hunger after 12h: ${hunger}`)
})

test('a stocked reserve keeps the fish alive while the page is closed', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({
    updatedAt: clockAt.now() - 3 * 86400 * 1000,
    reserve: 80,
    fish: [fish('f1', { hunger: 0.8, growth: 0.3 }), fish('f2', { hunger: 0.8, growth: 0.3 })],
  }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(29) })
  store.catchUp(clockAt.now())
  assert.equal(store.summary().fish, 2)
  assert.equal(store.takeNotices().died, 0)
  const fed = store.summary()
  assert.ok(fed.reserve < 80, 'the reserve fed the fish')
  assert.equal(fed.autoFed, 80 - fed.reserve)
  assert.equal(fed.manualFed, 0)
  assert.ok(store.getFish().every(current => current.growth > 0.3))
})

test('an empty reserve starves every fish over several days', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({
    updatedAt: clockAt.now() - 6 * 86400 * 1000,
    fish: [fish('f1', { hunger: 0.9 }), fish('f2', { hunger: 0.9 }), fish('f3', { hunger: 0.9 })],
  }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(31) })
  store.catchUp(clockAt.now())
  assert.equal(store.summary().fish, 0)
  assert.equal(store.takeNotices().died, 3)
})

test('tokens earned while away feed the fish on the next open', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({
    updatedAt: clockAt.now() - 3 * 86400 * 1000,
    tokenSeen: { s1: 0 },
    fish: [fish('f1', { hunger: 0.4 }), fish('f2', { hunger: 0.4 })],
  }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(37) })
  assert.equal(store.absorbTokens([{ id: 's1', total: 600000 }]).pellets, 60)
  store.catchUp(clockAt.now())
  assert.equal(store.summary().fish, 2)
  assert.equal(store.takeNotices().died, 0)
  assert.ok(store.summary().reserve < 60)
})

test('well-fed adults breed, capped at the tank limit', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({
    updatedAt: clockAt.now() - 6 * 86400 * 1000,
    reserve: 400,
    lastBirthAt: clockAt.now() - 30 * 86400 * 1000,
    fish: [fish('f1', { hunger: 0.95, growth: 0.98 }), fish('f2', { hunger: 0.95, growth: 0.98 })],
  }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(41) })
  store.catchUp(clockAt.now())
  assert.ok(store.summary().fish > 2)
  assert.ok(store.summary().fish <= tank.MAX_FISH)
  assert.ok(store.takeNotices().born > 0)
})

test('saved fish, reserve, and token baseline reopen unchanged', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({
    reserve: 10,
    tokenSeen: { s1: 50000 },
    tokensCounted: 50000,
    tokenRemainder: 5000,
    autoFed: 7,
    manualFed: 4,
    birthProgress: 3,
    lastBirthAt: 555,
    fish: [fish('f1', { growth: 0.7, hunger: 0.3 }), fish('f2')],
  }))
  const first = tank.createStore({ storage, now: clockAt.now, random: seeded(43) })
  first.catchUp(clockAt.now())
  assert.equal(first.save(), true)
  const reopened = tank.createStore({ storage, now: clockAt.now, random: seeded(47) })
  reopened.catchUp(clockAt.now())
  assert.equal(reopened.summary().fish, 2)
  assert.equal(reopened.summary().reserve, 10)
  assert.equal(reopened.summary().tokens, 50000)
  assert.equal(reopened.summary().autoFed, 7)
  assert.equal(reopened.summary().manualFed, 4)
  assert.equal(reopened.absorbTokens([{ id: 's1', total: 50000 }]).pellets, 0)
})

test('stored version 1 fish survive the migration', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, {
    version: 1,
    updatedAt: clockAt.now(),
    fish: [fish('old', { growth: 0.6, hunger: 0.4 })],
  })
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(53) })
  store.catchUp(clockAt.now())
  assert.equal(store.summary().fish, 1)
  assert.equal(store.summary().reserve, 0)
})

test('an empty tank can receive one new fry', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({ fish: [], reserve: 5 }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(59) })
  store.catchUp(clockAt.now())
  assert.equal(store.summary().fish, 0)
  assert.equal(store.feed(), 0)
  assert.equal(store.placeFish(), true)
  assert.equal(store.summary().fish, 1)
  assert.equal(store.feed(), tank.MANUAL_FEED)
  assert.equal(store.summary().manualFed, tank.MANUAL_FEED)
  assert.equal(store.placeFish(), false)
})

test('an open page auto-feeds one pellet to a hungry fish', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({ reserve: 5, fish: [fish('f1', { hunger: 0.75 })] }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(61) })
  store.catchUp(clockAt.now())
  store.step(clockAt.now() + 6000)
  assert.equal(store.summary().reserve, 4)
  assert.equal(store.summary().pellets, 1)
  assert.equal(store.summary().autoFed, 1)
  assert.equal(store.summary().manualFed, 0)
  store.step(clockAt.now() + 12000)
  assert.equal(store.summary().reserve, 4)
})

test('a suspended page settles the gap and can starve the fish', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({ fish: [fish('f1', { hunger: 0.2 })] }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(67) })
  store.catchUp(clockAt.now())
  store.step(clockAt.now() + 5 * 86400 * 1000)
  assert.equal(store.summary().fish, 0)
  assert.equal(store.takeNotices().died, 1)
})

test('unreadable storage starts a fresh tank instead of throwing', () => {
  const storage = memoryStorage()
  storage.setItem(STORAGE_KEY, '{not json')
  const store = tank.createStore({ storage, now: clock(1000).now, random: seeded(71) })
  assert.equal(store.summary().fish, 3)
})

test('a failed write reports failure instead of claiming a save', () => {
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded') },
    removeItem: () => {},
  }
  const store = tank.createStore({ storage, now: clock(1000).now, random: seeded(73) })
  store.catchUp(1000)
  assert.equal(store.save(), false)
  assert.equal(store.summary().saved, false)
})

test('a long swim keeps fish inside the water', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(79) })
  store.catchUp(clockAt.now())
  for (let frame = 0; frame < 1200; frame += 1) {
    store.step(clockAt.now())
    clockAt.advance(16)
  }
  for (const current of store.getFish()) {
    assert.ok(current.x >= 0.05 && current.x <= 0.95)
    assert.ok(current.y >= 0.08 && current.y <= 0.84)
  }
})

console.log('fish tank simulation: ok')
