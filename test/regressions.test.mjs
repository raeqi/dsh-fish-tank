import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const key = 'dsh.fish-tank.v1'
const day = 86400000
function load() {
  const ctx = { window: { __ModuleLoader__: { load() {} } }, console }
  vm.createContext(ctx)
  vm.runInContext(source, ctx)
  return { ctx, tank: ctx.DshFishTank }
}
function storage(value) {
  let data = value == null ? null : JSON.stringify(value)
  return { getItem: () => data, setItem: (_key, next) => { data = next }, raw: () => data }
}
function stored(overrides = {}) {
  return { version: 2, updatedAt: 1000, fish: [{ id: 'f1', x: .5, y: .5, angle: 0, growth: .4, hunger: .3, hue: 30, species: 0, seed: 1, starvingSince: null }], reserve: 0, tokenSeen: {}, tokensCounted: 0, tokenRemainder: 0, autoFed: 0, manualFed: 0, birthProgress: 0, lastBirthAt: 0, ...overrides }
}

test('a first tank starts its clock when the page actually opens', () => {
  let now = 1000
  const { tank } = load()
  const store = tank.createStore({ storage: storage(null), now: () => now, random: () => .5 })
  now += 5 * day
  store.catchUp(now)
  assert.equal(store.summary().fish, 3)
})

test('saving a paused simulation first advances its logical time', () => {
  let now = 1000
  const mem = storage(stored())
  const { tank } = load()
  const store = tank.createStore({ storage: mem, now: () => now, random: () => .5 })
  store.catchUp(now)
  now += 12 * 3600000
  assert.equal(store.save(), true)
  const reopened = tank.createStore({ storage: mem, now: () => now, random: () => .5 })
  reopened.catchUp(now)
  assert.ok(reopened.summary().hunger > .75)
})

test('an automatically released pellet survives saving before a fish eats it', () => {
  let now = 1000
  const fish = stored().fish[0]
  const mem = storage(stored({ reserve: 1, fish: [{ ...fish, hunger: .75 }] }))
  const { tank } = load()
  const store = tank.createStore({ storage: mem, now: () => now, random: () => .5 })
  store.catchUp(now)
  now += 6000
  store.step(now)
  assert.equal(store.summary().reserve, 0)
  assert.equal(store.summary().pellets, 1)
  store.save()
  const reopened = tank.createStore({ storage: mem, now: () => now, random: () => .5 })
  reopened.catchUp(now)
  assert.equal(reopened.summary().pellets, 1)
})

test('unreadable or newer data is never overwritten by a fallback tank', () => {
  const { tank } = load()
  for (const original of ['{bad json', JSON.stringify(stored({ version: 99, future: 'preserve' }))]) {
    const mem = { value: original, getItem() { return this.value }, setItem(_k, next) { this.value = next } }
    const store = tank.createStore({ storage: mem, now: () => 1000, random: () => .5 })
    store.catchUp(1000)
    assert.equal(store.save(), false)
    assert.equal(mem.value, original)
  }
})

test('extreme stored angles do not hang the animation loop', () => {
  const { ctx, tank } = load()
  const fish = { ...stored().fish[0], angle: 1e20 }
  const store = tank.createStore({ storage: storage(stored({ fish: [fish] })), now: () => 1000, random: () => .5 })
  store.catchUp(1000)
  ctx.store = store
  vm.runInContext('store.step(2000)', ctx, { timeout: 200 })
  assert.ok(Number.isFinite(store.getFish()[0].angle))
})

test('a blocked localStorage getter does not prevent initialization', () => {
  const { ctx, tank } = load()
  Object.defineProperty(ctx, 'localStorage', { get() { throw new Error('SecurityError') } })
  const store = tank.createStore({ now: () => 1000, random: () => .5 })
  store.catchUp(1000)
  assert.equal(store.save(), false)
})


test('a sequential stale instance cannot overwrite a newer snapshot', () => {
  const { tank } = load()
  const mem = storage(stored())
  const a = tank.createStore({ storage: mem, now: () => 1000, random: () => .5 })
  const b = tank.createStore({ storage: mem, now: () => 1000, random: () => .4 })
  a.catchUp(1000); b.catchUp(1000)
  a.feed()
  assert.equal(a.save(), true)
  assert.equal(b.save(), false)
  assert.equal(JSON.parse(mem.raw()).manualFed, 3)
})
