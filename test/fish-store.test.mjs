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

function loadBundle(globals = {}) {
  const registrations = []
  const context = {
    window: { __ModuleLoader__: { load: registration => registrations.push(registration) } },
    console,
    ...globals,
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
  assert.equal(store.absorbTokens([{ id: 's1', total: 520000 }]).pellets, 1)
  assert.equal(store.summary().reserve, 1)
  assert.equal(store.absorbTokens([{ id: 's1', total: 530000 }]).pellets, 0)
  assert.equal(store.absorbTokens([{ id: 's1', total: 540000 }]).pellets, 1)
  assert.equal(store.summary().tokens, 40000)
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
  assert.ok(store.getFish().some(fish => fish.id === 'f1'))
  assert.ok(store.getFish().some(fish => fish.id === 'f2'))
  assert.equal(store.takeNotices().died, 0)
  const fed = store.summary()
  assert.ok(fed.reserve < 80, 'the reserve fed the fish')
  assert.equal(fed.autoFed, 80 - fed.reserve)
  assert.equal(fed.manualFed, 0)
  assert.ok(store.getFish().filter(fish => fish.id === 'f1' || fish.id === 'f2').every(current => current.growth > 0.3))
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
  assert.equal(store.absorbTokens([{ id: 's1', total: 1200000 }]).pellets, 60)
  store.catchUp(clockAt.now())
  assert.ok(store.getFish().some(fish => fish.id === 'f1'))
  assert.ok(store.getFish().some(fish => fish.id === 'f2'))
  assert.equal(store.takeNotices().died, 0)
  assert.ok(store.summary().reserve < 60)
})

test('well-fed adults continue breeding without a population cap', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({
    updatedAt: clockAt.now() - 6 * 86400 * 1000,
    reserve: 4000,
    lastBirthAt: clockAt.now() - 30 * 86400 * 1000,
    fish: [fish('f1', { hunger: 0.95, growth: 0.98 }), fish('f2', { hunger: 0.95, growth: 0.98 })],
  }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(41) })
  store.catchUp(clockAt.now())
  assert.ok(store.summary().fish > 2)
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
/** Recording 2D context: counts drawing calls and records failures. */
function stubContext() {
  const calls = []
  const gradient = { addColorStop() {} }
  const handler = {
    get(target, property) {
      if (property === 'calls') return calls
      if (property in target) return target[property]
      if (property === 'createLinearGradient' || property === 'createRadialGradient') {
        return (...args) => { calls.push([property, ...args]); return gradient }
      }
      return (...args) => { calls.push([property, ...args]) }
    },
    set(target, property, value) {
      target[property] = value
      return true
    },
  }
  return new Proxy({}, handler)
}

function sceneFor() {
  const fish = [
    { id: 'a', x: 0.2, y: 0.3, angle: 0.1, growth: 0.9, hunger: 0.2, hue: 18, species: 0, seed: 3 },
    { id: 'b', x: 0.5, y: 0.5, angle: 2.9, growth: 0.5, hunger: 0.5, hue: 340, species: 1, seed: 9 },
    { id: 'c', x: 0.7, y: 0.4, angle: 0.3, growth: 0.7, hunger: 0.8, hue: 205, species: 2, seed: 11 },
    { id: 'd', x: 0.8, y: 0.6, angle: 3.1, growth: 0.3, hunger: 1, hue: 160, species: 3, seed: 17 },
  ]
  return {
    fish,
    pellets: [{ x: 0.4, y: 0.2, wobble: 1 }],
    ripples: [{ x: 0.4, y: 0.2, age: 0.2 }],
    bubbles: [{ x: 0.1, y: 0.6, r: 1, speed: 0.02, phase: 0 }],
    ghosts: [{ fish, x: 0.3, y: 0.7, age: 0.4 }],
    splashes: [{ x: 0.4, y: 0.25, age: 0.2 }],
    sparkles: [{ x: 0.5, y: 0.5, age: 0.3, hue: 40 }],
  }
}

test('the renderer draws every species and effect without throwing', () => {
  const context = stubContext()
  tank.drawScene(context, { width: 900, height: 400, dpr: 2 }, sceneFor(), 8000)
  assert.ok(context.calls.length > 100, 'draws a full frame')
  for (const species of [0, 1, 2, 3]) {
    const single = stubContext()
    tank.drawFish(single, {
      x: 0.5, y: 0.5, angle: 0, growth: 1, hunger: 1, hue: 30, species, seed: 5,
    }, 300, 200, 9000, 2, 0.8)
    assert.ok(single.calls.length > 20, `draws species ${species}`)
  }
})

test('cruising follows the same path at different frame rates', () => {
  function swim(fps) {
    const clockAt = clock(1000)
    const storage = memoryStorage()
    preload(storage, stored({ fish: [fish('cruiser', { x: 0.7, y: 0.5, angle: 0.2, species: 2, seed: 91 })] }))
    const store = tank.createStore({ storage, now: clockAt.now, random: seeded(79) })
    store.catchUp(clockAt.now())
    for (let frame = 1; frame <= fps * 30; frame += 1) store.step(1000 + frame * 1000 / fps)
    return store.getFish()[0]
  }
  const slow = swim(30)
  const fast = swim(120)
  assert.ok(Math.abs(slow.x - fast.x) < 0.015, 'horizontal path does not depend on frame rate')
  assert.ok(Math.abs(slow.y - fast.y) < 0.015, 'vertical path does not depend on frame rate')
})

test('a fish near the glass turns gradually and swims back into open water', () => {
  const clockAt = clock(1000)
  const storage = memoryStorage()
  preload(storage, stored({ fish: [fish('edge', { x: 0.94, y: 0.5, angle: 0, species: 2, seed: 91 })] }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(79) })
  store.catchUp(1000)
  let previous = store.getFish()[0].angle
  for (let frame = 1; frame <= 600; frame += 1) {
    store.step(1000 + frame * 16)
    const current = store.getFish()[0]
    const delta = Math.atan2(Math.sin(current.angle - previous), Math.cos(current.angle - previous))
    assert.ok(Math.abs(delta) < 0.025, 'turn has no sudden bounce')
    previous = current.angle
  }
  assert.ok(store.getFish()[0].x < 0.9, 'returns to open water')
})

test('all eighteen species retain their own atlas and cell in the photographic fallback', () => {
  let images = 0
  class LoadedImage {
    constructor() { images += 1 }
    set src(value) {
      assert.ok(value.startsWith('data:image/webp;base64,'), 'asset ships offline in the Client bundle')
      this.value = value
      this.onload()
    }
  }
  const { tank: photographic } = loadBundle({ Image: LoadedImage })
  const atlases = []
  for (let species = 0; species < 18; species += 1) {
    const context = stubContext()
    photographic.drawFish(context, fish('photo', { species }), 800, 500, 10, 1, 1)
    const draw = context.calls.find(call => call[0] === 'drawImage')
    assert.ok(draw, 'draws a photographic fish')
    const cell = species >= 12 ? species - 12 : species % 6
    const columns = species >= 12 ? 4 : 3
    const cellWidth = species >= 12 ? 1774 / 4 : 512
    const cellHeight = species >= 12 ? 887 / 2 : 512
    assert.equal(draw[2], (cell % columns) * cellWidth)
    assert.equal(draw[3], Math.floor(cell / columns) * cellHeight)
    const group = Math.floor(species / 6)
    if (!atlases[group]) atlases[group] = draw[1]
    assert.equal(draw[1], atlases[group], `species ${species} uses its atlas`)
  }
  assert.equal(new Set(atlases).size, 3, 'common, rare and chapter fish use distinct atlases')
  assert.equal(images, 3, 'three fish atlases shared per page')
})

test('new species preserve their identity when a tank is reopened', () => {
  const storage = memoryStorage()
  preload(storage, stored({ fish: [fish('discus', { species: 4 }), fish('ram', { species: 5 })] }))
  const store = tank.createStore({ storage, now: clock(1000).now, random: seeded(91) })
  store.catchUp(1000)
  assert.deepEqual(plain(store.getFish().map(fish => fish.species)), [4, 5])
  assert.equal(store.save(), true)
  const reopened = tank.createStore({ storage, now: clock(1000).now, random: seeded(91) })
  assert.deepEqual(plain(reopened.getFish().map(fish => fish.species)), [4, 5])
})

function gameTank(overrides = {}, random = seeded(103)) {
  const clockAt = clock(1800000000000)
  const storage = memoryStorage()
  preload(storage, stored({ updatedAt: clockAt.now(), fish: [fish('parent-a', { species: 0, seed: 11, x: 0.3, y: 0.5, growth: 0.95, hunger: 0.65 }), fish('parent-b', { species: 0, seed: 22, x: 0.7, y: 0.5, growth: 0.95, hunger: 0.65 })], ...overrides }))
  const store = tank.createStore({ storage, now: clockAt.now, random })
  store.catchUp(clockAt.now())
  return { store, clockAt, storage }
}

function giveMeal(run, id = 'parent-a') {
  const current = run.store.getFish().find(fish => fish.id === id)
  assert.equal(run.store.dropFood(current.x, current.y), true)
  run.clockAt.advance(16)
  assert.ok(run.store.step(run.clockAt.now()).ate > 0)
}

test('old tanks retain their fish and token balance but gain no historical visits', () => {
  const run = gameTank({ tokensCounted: 22000000, reserve: 2900, tokenSeen: { s1: 22000000 } })
  assert.equal(run.store.gameSummary().tickets, 0)
  assert.equal(run.store.summary().reserve, 2900)
  assert.deepEqual(plain(run.store.gameSummary().discovered), [0])
  run.store.absorbTokens([{ id: 's1', total: 22350000 }])
  assert.equal(run.store.gameSummary().tickets, 1)
  assert.equal(run.store.gameSummary().journeyProgress, 50000)
  assert.equal(run.store.summary().reserve, 2917)
})

test('parents create eggs before a fry hatches, and the fry inherits a parent species', () => {
  const run = gameTank()
  for (let meal = 0; meal < 8; meal += 1) giveMeal(run)
  assert.ok(run.store.gameSummary().nursery)
  assert.equal(run.store.summary().fish, 2)
  assert.equal(run.store.takeNotices().born, 0)
  run.clockAt.advance(21 * 60000)
  run.store.step(run.clockAt.now())
  const baby = run.store.getFish().find(fish => fish.origin === 'bred')
  assert.ok(baby)
  assert.equal(baby.generation, 1)
  assert.ok([0, 6, 7, 8, 9, 10, 11].includes(baby.species))
  assert.equal(run.store.gameSummary().nursery, null)
  assert.equal(run.store.takeNotices().born, 1)
})

test('one adult cannot breed by repeated feeding', () => {
  const run = gameTank({ fish: [fish('parent-a', { species: 0, growth: 1, hunger: 0.65 })] })
  for (let meal = 0; meal < 8; meal += 1) giveMeal(run)
  assert.equal(run.store.gameSummary().nursery, null)
  assert.equal(run.store.summary().fish, 1)
})

test('feeding parents accelerates incubation without creating duplicate eggs', () => {
  const run = gameTank()
  for (let meal = 0; meal < 8; meal += 1) giveMeal(run)
  const before = run.store.gameSummary().nursery.remaining
  giveMeal(run, 'parent-b')
  assert.ok(run.store.gameSummary().nursery.remaining <= before - 120000)
  assert.equal(run.store.gameSummary().nursery.care, 1)
  assert.equal(run.store.gameSummary().journal.filter(entry => entry.type === 'eggs').length, 1)
})

test('the eighth ordinary breeding attempt guarantees a rare or legendary fry', () => {
  const run = gameTank({ game: { breedPity: 7 } })
  for (let meal = 0; meal < 8; meal += 1) giveMeal(run)
  run.clockAt.advance(21 * 60000)
  run.store.step(run.clockAt.now())
  const baby = run.store.getFish().find(fish => fish.origin === 'bred')
  assert.ok(baby.species >= 6)
  assert.equal(run.store.gameSummary().breedPity, 0)
})

test('a ready nursery hatches even when eight fish already live in the tank', () => {
  const stamp = 1800000000000
  const run = gameTank({ fish: Array.from({ length: 8 }, (_, i) => fish('resident-' + i, { species: i % 6, seed: i, growth: 0.5 })), game: { nursery: { species: 10, createdAt: stamp - 21 * 60000, readyAt: stamp - 60000, generation: 3, parentIds: [], care: 0 } } })
  assert.equal(run.store.summary().fish, 9)
  assert.equal(run.store.gameSummary().nursery, null)
  assert.equal(run.store.getFish().find(fish => fish.species === 10).generation, 3)
})

test('reopening keeps the already-drawn egg identity, discovery and breeding guarantee', () => {
  const run = gameTank({ game: { breedPity: 7 } })
  for (let meal = 0; meal < 8; meal += 1) giveMeal(run)
  assert.equal(run.store.save(), true)
  const savedEgg = JSON.parse(run.storage.getItem(STORAGE_KEY)).game.nursery
  const reopened = tank.createStore({ storage: run.storage, now: run.clockAt.now, random: seeded(999) })
  reopened.catchUp(run.clockAt.now())
  reopened.save()
  assert.deepEqual(JSON.parse(run.storage.getItem(STORAGE_KEY)).game.nursery, savedEgg)
  run.clockAt.advance(21 * 60000)
  reopened.step(run.clockAt.now())
  assert.ok(reopened.getFish().some(fish => fish.species === savedEgg.species && fish.origin === 'bred'))
})

test('visits spend tickets independently of food and obey the tenth-visit guarantee', () => {
  const rolls = []; const fallback = seeded(107)
  const run = gameTank({ reserve: 7, game: { tickets: 2, visitPity: 9 } }, () => rolls.length ? rolls.shift() : fallback())
  rolls.push(0.99, 0.4)
  assert.equal(run.store.welcomeVisitor(), true)
  assert.ok(run.store.getFish().find(fish => fish.origin === 'visitor').species >= 6)
  assert.equal(run.store.gameSummary().visitPity, 0)
  assert.equal(run.store.gameSummary().tickets, 1)
  assert.equal(run.store.summary().reserve, 7)
  rolls.push(0.01, 0.4)
  assert.equal(run.store.welcomeVisitor(), true)
  assert.ok(run.store.getFish().some(fish => fish.origin === 'visitor' && fish.species >= 9))
  assert.equal(run.store.welcomeVisitor(), false)
})

test('new visitors enter the tank directly beyond the old eight-fish limit', () => {
  const run = gameTank({ fish: Array.from({ length: 8 }, (_, i) => fish('fish-' + i, { species: i % 6 })), game: { tickets: 1 } })
  assert.equal(run.store.welcomeVisitor(), true)
  assert.equal(run.store.summary().fish, 9)
  assert.equal(run.store.gameSummary().archive.length, 0)
  assert.equal(run.store.gameSummary().tickets, 0)
  const visitor = run.store.getFish().find(fish => fish.origin === 'visitor')
  assert.equal(run.store.archiveFish(visitor.id), true)
  const saved = run.store.gameSummary().archive[0]
  run.clockAt.advance(8 * 86400000)
  run.store.step(run.clockAt.now())
  assert.deepEqual(plain(run.store.gameSummary().archive[0]), plain(saved), 'manual sanctuary still pauses the fish simulation')
})

test('moving fish to the sanctuary and back preserves identity and discoveries', () => {
  const run = gameTank()
  assert.equal(run.store.archiveFish('parent-a'), true)
  assert.equal(run.store.summary().fish, 1)
  assert.equal(run.store.restoreFish('parent-a'), true)
  assert.equal(run.store.summary().fish, 2)
  assert.equal(run.store.getFish().find(fish => fish.id === 'parent-a').species, 0)
  assert.equal(run.store.restoreFish('missing'), false)
  assert.deepEqual(plain(run.store.gameSummary().discovered), [0])
})

test('plant growth continues offline and pruning yields a reusable cutting', () => {
  const run = gameTank({ game: { garden: { growth: 0.6, patches: 3, cuttings: 0 } }, fish: [] })
  assert.equal(run.store.prunePlants(), false)
  run.clockAt.advance(86400000)
  run.store.step(run.clockAt.now())
  assert.ok(Math.abs(run.store.gameSummary().garden.growth - 0.78) < 0.001)
  assert.equal(run.store.prunePlants(), true)
  assert.ok(Math.abs(run.store.gameSummary().garden.growth - 0.38) < 0.001)
  assert.equal(run.store.gameSummary().garden.cuttings, 1)
  assert.equal(run.store.plantCutting(), true)
  assert.equal(run.store.gameSummary().garden.patches, 4)
  assert.equal(run.store.gameSummary().garden.cuttings, 0)
  assert.equal(run.store.plantCutting(), false)
})

test('plant patches cap at eight and preserve cuttings when planting is unavailable', () => {
  const run = gameTank({ game: { garden: { growth: 0.8, patches: 8, cuttings: 2 } } })
  assert.equal(run.store.plantCutting(), false)
  assert.equal(run.store.gameSummary().garden.cuttings, 2)
  run.store.save()
  const reopened = tank.createStore({ storage: run.storage, now: run.clockAt.now })
  assert.equal(reopened.gameSummary().garden.patches, 8)
})

test('dense plants shorten the initial egg incubation by twenty percent', () => {
  const run = gameTank({ game: { garden: { growth: 0.8, patches: 8 } } })
  for (let meal = 0; meal < 8; meal += 1) giveMeal(run)
  assert.equal(run.store.gameSummary().nursery.remaining, 16 * 60000)
})

test('fish retain at least ninety percent of their width while swimming vertically', () => {
  class LoadedImage { set src(value) { this.onload() } }
  const { tank: photographic } = loadBundle({ Image: LoadedImage })
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const context = stubContext()
    photographic.drawFish(context, fish('turn', { species: 4, angle }), 800, 500, 10, 1, 1)
    const transform = context.calls.find(call => call[0] === 'scale')
    assert.ok(Math.abs(transform[1]) >= 0.9, 'no paper-thin fish during turns')
  }
})

test('the first upgraded save preserves the original JSON once without overwriting its backup', () => {
  const run = gameTank({ reserve: 123 })
  const original = run.storage.getItem(STORAGE_KEY)
  assert.equal(run.store.save(), true)
  assert.equal(run.storage.getItem('dsh.fish-tank.before-v3'), original)
  assert.equal(JSON.parse(run.storage.getItem(STORAGE_KEY)).version, 3)
  run.store.feed()
  run.store.save()
  assert.equal(run.storage.getItem('dsh.fish-tank.before-v3'), original)
})

test('neither aquarium nor sanctuary limits block keeping new fish', () => {
  const run = gameTank({ fish: Array.from({ length: 8 }, (_, i) => fish('tank-' + i, { species: i % 6 })), game: { tickets: 2, archive: Array.from({ length: 128 }, (_, i) => fish('archive-' + i, { species: i % 6 })) } })
  assert.equal(run.store.welcomeVisitor(), true)
  assert.equal(run.store.gameSummary().tickets, 1)
  assert.equal(run.store.archiveFish('tank-0'), true)
  assert.equal(run.store.restoreFish('archive-0'), true)
})

test('a snapshot is portable between the browser and the Host file', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({ reserve: 4, fish: [fish('f1'), fish('f2')] }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(31) })
  store.catchUp(clockAt.now())
  const snapshot = store.snapshot()
  assert.equal(typeof snapshot.updatedAt, 'number')
  assert.equal(snapshot.fish.length, 2)
  assert.equal(snapshot.reserve, 4)

  const other = memoryStorage()
  preload(other, { ...snapshot, updatedAt: snapshot.updatedAt + 1 })
  const reopened = tank.createStore({ storage: other, now: clockAt.now, random: seeded(33) })
  reopened.catchUp(clockAt.now())
  assert.equal(reopened.summary().fish, 2)
  assert.equal(reopened.summary().reserve, 4)
})

test('adopting a newer Host snapshot replaces the local tank', () => {
  const storage = memoryStorage()
  const clockAt = clock(1000)
  preload(storage, stored({ reserve: 1, fish: [fish('local')], updatedAt: 1000 }))
  const store = tank.createStore({ storage, now: clockAt.now, random: seeded(37) })
  store.catchUp(clockAt.now())
  assert.equal(store.summary().reserve, 1)

  const older = { ...stored({ reserve: 9, fish: [fish('remote')], updatedAt: 500 }) }
  assert.equal(store.adopt(older), false, 'an older file never replaces local history')
  assert.equal(store.summary().reserve, 1)

  const newer = stored({ reserve: 9, fish: [fish('remote')], updatedAt: 4000 })
  assert.equal(store.adopt(newer), true)
  assert.equal(store.summary().reserve, 9)
  assert.equal(store.summary().fish, 1)
})

test('a browser without history adopts the Host snapshot even when older', () => {
  const clockAt = clock(1000)
  const store = tank.createStore({ storage: memoryStorage(), now: clockAt.now, random: seeded(41) })
  store.catchUp(clockAt.now())
  assert.equal(store.summary().fish, 3)
  assert.equal(store.adopt(stored({ reserve: 6, fish: [fish('remote')], updatedAt: 10 })), true)
  assert.equal(store.summary().fish, 1)
  assert.equal(store.summary().reserve, 6)
})

test('the page component renders under a minimal hook runtime', () => {
  let page = null
  const ctx = {
    effect(run) { run() },
    locale: { register() { return () => {} }, bind() { return key => key } },
    slots: {
      inject(name, run) { run() },
      register(options, component) { if (options.name === 'main') page = component; return () => {} },
    },
  }
  const react = {
    createElement(type, props, ...children) { return { type, props, children } },
    useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}] },
    useRef(value) { return { current: value } },
    useEffect() {},
    useMemo(run) { return run() },
  }
  const plugin = first.registration.factory(name => (name === 'react' ? react : {}))
  plugin.apply(ctx)
  assert.equal(typeof page, 'function')
  const tree = page({ t: key => key, useSessions: () => null })
  assert.equal(tree.type, 'div')
})

test('Host snapshots carry nursery, guarantees, sanctuary, discoveries and plants together', () => {
  const original = gameTank({ game: { tickets: 4, visitPity: 8, breedPity: 7, garden: { growth: 0.8, patches: 7, cuttings: 3 }, archive: [fish('archived', { species: 11 })] } })
  for (let meal = 0; meal < 8; meal += 1) giveMeal(original)
  const snapshot = original.store.snapshot()
  const other = tank.createStore({ storage: memoryStorage(), now: original.clockAt.now, random: seeded(118) })
  assert.equal(other.adopt(snapshot), true)
  other.catchUp(original.clockAt.now())
  const restored = other.gameSummary()
  assert.equal(restored.tickets, 4)
  assert.equal(restored.visitPity, 8)
  assert.equal(restored.archive[0].species, 11)
  assert.equal(restored.garden.patches, 7)
  assert.equal(restored.garden.cuttings, 3)
  assert.ok(restored.nursery)
  assert.ok(restored.discovered.includes(11))
  const readback = other.snapshot()
  assert.equal(readback.game.nursery.species, snapshot.game.nursery.species)
  assert.equal(readback.game.breedPity, snapshot.game.breedPity)
})

test('each million lifetime tokens expands the habitat without spending food or visits', () => {
  const run = gameTank({ tokensCounted: 990000, tokenSeen: { s1: 990000 }, reserve: 4 })
  assert.equal(run.store.summary().tank.level, 1)
  run.store.absorbTokens([{ id: 's1', total: 3010000 }])
  const current = run.store.summary()
  assert.equal(current.tank.level, 4)
  assert.equal(current.tank.space, 20)
  assert.equal(current.reserve, 105)
  assert.equal(current.game.tickets, 6)
  assert.equal(current.tank.nextTokens, 990000)
  run.store.save()
  const reopened = tank.createStore({ storage: run.storage, now: run.clockAt.now })
  assert.equal(reopened.summary().tank.level, 4)
})

test('existing lifetime tokens unlock expansions on upgrade without retroactive reward draws', () => {
  const run = gameTank({ tokensCounted: 22000000, reserve: 2000 })
  assert.equal(run.store.summary().tank.level, 23)
  assert.equal(run.store.gameSummary().tickets, 0)
  assert.equal(run.store.summary().reserve, 2000)
})

test('large schools and a large sanctuary survive save, reopen and a swim', () => {
  const run = gameTank({ tokensCounted: 10000000, fish: Array.from({ length: 300 }, (_, i) => fish('school-' + i, { species: i % 12, seed: i, x: 0.1 + (i % 20) * 0.04, y: 0.2 + (i % 12) * 0.04 })), game: { archive: Array.from({ length: 180 }, (_, i) => fish('archive-' + i, { species: i % 12 })) } })
  run.store.save()
  const reopened = tank.createStore({ storage: run.storage, now: run.clockAt.now, random: seeded(151) })
  reopened.catchUp(run.clockAt.now())
  run.clockAt.advance(16)
  reopened.step(run.clockAt.now())
  assert.equal(reopened.getFish().length, 300)
  assert.equal(reopened.gameSummary().archive.length, 180)
  assert.ok(reopened.getFish().every(fish => Number.isFinite(fish.x) && Number.isFinite(fish.y)))
})

test('direct account totals replace estimates and never double-credit session usage', () => {
  const run = gameTank({ reserve: 3 })
  assert.equal(run.store.absorbAccountTotal('account-1', 10000000), true)
  assert.equal(run.store.summary().tokens, 10000000)
  assert.equal(run.store.summary().reserve, 3, 'first account read is a reward baseline')
  assert.equal(run.store.absorbAccountTotal('account-1', 10310000), true)
  assert.equal(run.store.summary().reserve, 18)
  assert.equal(run.store.gameSummary().tickets, 1)
  run.store.absorbAccountTotal('account-1', 10310000)
  run.store.absorbAccountTotal('account-1', 10000000)
  assert.equal(run.store.summary().reserve, 18)
  assert.deepEqual(plain(run.store.absorbTokens([{ id: 's1', total: 99999999 }])), { pellets: 0, tokens: 0 })
  assert.equal(run.store.absorbAccountTotal('other-account', 90000000), false)
  run.store.save()
  const reopened = tank.createStore({ storage: run.storage, now: run.clockAt.now })
  reopened.absorbAccountTotal('account-1', 10400000)
  assert.equal(reopened.summary().reserve, 23)
})

test('completing the first collection unlocks six more species and new visitors', () => {
  const rolls=[];const fallback=seeded(203)
  const run=gameTank({game:{discovered:Array.from({length:12},(_,i)=>i),tickets:4}},()=>rolls.length?rolls.shift():fallback())
  assert.equal(run.store.gameSummary().chapter,2)
  rolls.push(0.99,0.2)
  assert.equal(run.store.welcomeVisitor(),true)
  const visitor=run.store.getFish().find(fish=>fish.origin==='visitor')
  assert.ok([14,15,17].includes(visitor.species))
  assert.ok(run.store.gameSummary().discovered.includes(visitor.species))
})

function predatorTank({hunting=true,preyOverrides={},extraGame={}}={}) {
  return gameTank({reserve:0,fish:[fish('hunter',{species:12,x:.5,y:.5,growth:1,hunger:.65,seed:11}),fish('prey',{species:0,x:.51,y:.5,growth:.2,hunger:.4,origin:'bred',seed:99,...preyOverrides}),...Array.from({length:14},(_,i)=>fish('resident-'+i,{species:i%6,x:.1+(i%4)*.2,y:.2+(i%3)*.15,growth:.6,hunger:.3,origin:'starter',seed:i*31}))],game:{chapter:2,hunting,...extraGame}})
}

test('hunting is opt-in and catches only common home-bred fry during live frames',()=>{
  const off=predatorTank({hunting:false});off.clockAt.advance(16);off.store.step(off.clockAt.now());assert.equal(off.store.getFish().length,16)
  const run=predatorTank();run.clockAt.advance(16);run.store.step(run.clockAt.now())
  assert.equal(run.store.getFish().length,15)
  assert.equal(run.store.getFish().some(fish=>fish.id==='prey'),false)
  assert.equal(run.store.gameSummary().hunted,1)
  assert.ok(run.store.getFish().find(fish=>fish.id==='hunter').lastHuntAt>0)
})

test('rare fry, original fish and larger fish are protected from hunting',()=>{
  for(const preyOverrides of [{species:6},{origin:'starter'},{growth:.5}]){
    const run=predatorTank({preyOverrides});run.clockAt.advance(16);run.store.step(run.clockAt.now())
    assert.equal(run.store.getFish().length,16)
    assert.ok(run.store.getFish().some(fish=>fish.id==='prey'))
  }
})

test('food interrupts hunting and offline catch-up never runs predation',()=>{
  const run=predatorTank();run.store.dropFood(.5,.5);run.clockAt.advance(16);run.store.step(run.clockAt.now());assert.equal(run.store.getFish().length,16)
  const storage=memoryStorage();preload(storage,stored({updatedAt:1800000000000-3600000,fish:run.store.getFish(),game:{chapter:2,hunting:true}}))
  const other=tank.createStore({storage,now:()=>1800000000000,random:seeded(209)});other.catchUp(1800000000000)
  assert.equal(other.gameSummary().hunted,0)
  assert.equal(other.getFish().length,16)
})

test('care milestones grant one permanent turtle companion across reloads',()=>{
  const run=gameTank({tokensCounted:1000000,game:{births:3,garden:{growth:.8,patches:5,cuttings:0}}})
  assert.ok(run.store.gameSummary().turtle)
  assert.equal(run.store.takeNotices().turtle,1)
  run.store.save()
  const other=tank.createStore({storage:run.storage,now:run.clockAt.now,random:seeded(211)});other.catchUp(run.clockAt.now())
  assert.ok(other.gameSummary().turtle)
  assert.equal(other.takeNotices().turtle,0)
  assert.equal(other.summary().fish,2,'turtle is a companion, not an extra fish')
})

test('second-chapter fish render at a valid positive size',()=>{
  class LoadedImage {set src(value){this.onload()}}
  const {tank:photos}=loadBundle({Image:LoadedImage})
  for(let species=12;species<18;species++){
    const context=stubContext();photos.drawFish(context,fish('new',{species}),800,500,10,1,1)
    const call=context.calls.find(item=>item[0]==='drawImage')
    assert.ok(call)
    assert.ok(call.slice(2).every(value=>Number.isFinite(value)))
    assert.ok(call[4]>0&&call[5]>0)
  }
})

test('verified cloud accounts do not mix fish from a different account',()=>{
  const run=gameTank()
  assert.equal(run.store.adoptScoped('alice',null),true)
  assert.equal(run.store.snapshot().ownerId,'alice')
  assert.equal(run.store.getFish().length,2)
  const other=stored({ownerId:'bob',updatedAt:1,fish:[fish('bobs-fish',{species:3})]})
  assert.equal(run.store.adoptScoped('bob',other),true)
  assert.equal(run.store.getFish()[0].id,'bobs-fish')
  assert.equal(run.store.snapshot().ownerId,'bob')
  assert.equal(run.store.adoptScoped('alice',other),false)
})

test('old rations, visit tickets and token remainders survive the new exchange rates', () => {
  const run = gameTank({ reserve: 50, tokenRemainder: 9000, tokenSeen: { s1: 500000 }, game: { tickets: 7, journeyProgress: 99000 } })
  assert.equal(run.store.absorbTokens([{ id: 's1', total: 511000 }]).pellets, 1)
  assert.equal(run.store.gameSummary().tickets, 7)
  assert.equal(run.store.gameSummary().journeyProgress, 110000)
  run.store.absorbTokens([{ id: 's1', total: 701000 }])
  assert.equal(run.store.gameSummary().tickets, 8)
  assert.equal(run.store.summary().reserve, 60)
  assert.equal(run.store.gameSummary().journeyProgress, 0)
})

test('collection prioritizes missing species, and the fourth repeat attempt is rescued across saves', () => {
  const rolls = []; const fallback = seeded(273)
  const random = () => rolls.length ? rolls.shift() : fallback()
  const run = gameTank({ fish: [fish('starter', { species: 0 })], game: { tickets: 12, discovered: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10] } }, random)
  rolls.push(0.9, 0)
  assert.equal(run.store.welcomeVisitor(), true)
  assert.ok(run.store.gameSummary().discovered.includes(5))
  for (let i = 0; i < 3; i += 1) {
    rolls.push(0.9, 0)
    assert.equal(run.store.welcomeVisitor(), true)
  }
  assert.equal(run.store.gameSummary().collectionMisses, 3)
  assert.equal(run.store.save(), true)
  const reopened = tank.createStore({ storage: run.storage, now: run.clockAt.now, random })
  reopened.catchUp(run.clockAt.now())
  rolls.push(0.9, 0)
  assert.equal(reopened.welcomeVisitor(), true)
  assert.ok(reopened.gameSummary().discovered.includes(11))
  assert.equal(reopened.gameSummary().chapter, 2)
  assert.equal(reopened.gameSummary().collectionMisses, 0)
})

test('even unfavorable rolls cannot require more than 36 visits for a fresh collection', () => {
  const rolls = []; const fallback = seeded(511)
  const store = tank.createStore({ storage: null, now: () => 1000, random: () => rolls.length ? rolls.shift() : fallback() })
  store.absorbTokens([{ id: 's1', total: 0 }])
  store.absorbTokens([{ id: 's1', total: 10800000 }])
  store.catchUp(1000)
  for (let i = 0; i < 36 && store.gameSummary().chapter === 1; i += 1) {
    rolls.push(.999, 0)
    assert.equal(store.welcomeVisitor(), true)
  }
  assert.equal(store.gameSummary().chapter, 2)
  assert.ok(store.summary().fish <= 39)
})

test('old offline time uses old portions, but the same fish consumes more after updating', () => {
  const stamp = 1800000000000
  function simulate(feedingBalance) {
    return gameTank({ updatedAt: stamp - 86400000, fish: [fish('one', { hunger: .7, growth: .1 })], reserve: 100, game: { feedingBalance } })
  }
  const before = simulate(false)
  const after = simulate(true)
  assert.equal(before.store.summary().autoFed, 25)
  assert.ok(after.store.summary().autoFed >= 30 && after.store.summary().autoFed <= 32)
  assert.equal(after.store.getFish()[0].growth, 1)
  assert.equal(after.store.takeNotices().died, 0)
  before.clockAt.advance(86400000)
  before.store.step(before.clockAt.now())
  assert.ok(before.store.summary().autoFed >= 55, 'future days use the new feeding pace')
  assert.equal(before.store.snapshot().game.feedingBalance, true)
})

test('a large hungry school receives multiple pellets without touching the last reserved ones twice', () => {
  const run = gameTank({ reserve: 6, fish: Array.from({ length: 40 }, (_, i) => fish('school-' + i, { hunger: .8 })) })
  run.clockAt.advance(16)
  run.store.step(run.clockAt.now())
  assert.equal(run.store.summary().autoFed, 4)
  assert.equal(run.store.summary().reserve, 2)
  run.clockAt.advance(4999)
  run.store.step(run.clockAt.now())
  assert.equal(run.store.summary().autoFed, 4)
})

test('water level 50 and 100 unlock new scenery and account source switching cannot roll it back', () => {
  const run = gameTank({ tokensCounted: 48999999, reserve: 10 })
  assert.equal(run.store.getScene().tank.habitatTier, 0)
  assert.equal(run.store.getScene().tank.nextHabitatLevel, 50)
  run.store.absorbAccountTotal('account', 49000000)
  assert.equal(run.store.getScene().tank.habitatTier, 1)
  assert.equal(run.store.getScene().tank.nextHabitatLevel, 100)
  run.store.absorbAccountTotal('account', 99000000)
  assert.equal(run.store.getScene().tank.habitatTier, 2)
  assert.equal(run.store.getScene().tank.nextHabitatLevel, 150)
  assert.equal(run.store.save(), true)
  const reopened = tank.createStore({ storage: run.storage, now: run.clockAt.now })
  assert.equal(reopened.getScene().tank.habitatTier, 2)
})
