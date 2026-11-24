import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { advanceVisualYaw, bodyEnvelope } from '../src/renderer/fish-volume.js'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
function load(extra = {}) {
  class ImageStub {
    set src(value) { this.value = value; this.naturalWidth = 1536; this.naturalHeight = 1024; this.onload?.() }
  }
  const ctx = { window: { __ModuleLoader__: { load() {} } }, Image: ImageStub, console, ...extra }
  vm.createContext(ctx); vm.runInContext(source, ctx)
  return ctx.DshFishTank
}
function canvas() {
  const calls = []
  const gradient = { addColorStop() {} }
  return { calls, context: new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop]
      if (prop === 'drawImage') return (...args) => calls.push(args)
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient
      return () => {}
    },
    set(target, prop, value) { target[prop] = value; return true },
  }) }
}
const sampleFish = { id: 'a', x: .5, y: .5, angle: 0, growth: .5, hunger: .3, hue: 30, species: 1, seed: 4, starvingSince: null }

test('the 2D fallback moves the tail more than the head and honours reduced motion', () => {
  const tank = load(), first = canvas(), next = canvas(), quiet = canvas()
  tank.drawFish(first.context, sampleFish, 800, 500, 0, 1, 1)
  tank.drawFish(next.context, sampleFish, 800, 500, .55, 1, 1)
  tank.drawFish(quiet.context, sampleFish, 800, 500, .55, 1, 1, true)
  assert.equal(first.calls.length, 20)
  assert.equal(next.calls.length, 20)
  const tailChange = Math.abs(first.calls[0][6] - next.calls[0][6])
  const headChange = Math.abs(first.calls[19][6] - next.calls[19][6])
  assert.ok(tailChange > headChange * 4, `tail ${tailChange}, head ${headChange}`)
  assert.equal(quiet.calls.length, 1, 'reduced motion renders a still silhouette')
})

test('fish tail phase follows simulation steps without entering saved fish data', () => {
  const tank = load()
  let value = JSON.stringify({ version: 2, updatedAt: 1000, fish: [sampleFish], reserve: 0, tokenSeen: {} })
  const storage = { getItem: () => value, setItem: (_key, next) => { value = next } }
  const store = tank.createStore({ storage, now: () => 1000, random: () => .5 })
  store.catchUp(1000); store.step(1016)
  const fish = store.getScene().fish[0], before = fish.swimPhase
  store.step(1032)
  assert.ok(fish.swimPhase > before)
  store.save()
  assert.equal(JSON.parse(value).fish[0].swimPhase, undefined)
})

test('visual turns are smooth and separate from vertical movement', () => {
  assert.equal(advanceVisualYaw(undefined, 0, .016), 0)
  const climbing = advanceVisualYaw(0, Math.PI * .48, .016)
  assert.equal(climbing, 0, 'moving upward does not by itself turn the fish edge-on')
  const firstTurn = advanceVisualYaw(0, Math.PI, .016)
  assert.ok(firstTurn > 0 && firstTurn < Math.PI, 'a direction reversal begins smoothly')
  let turned = firstTurn
  for (let i = 0; i < 100; i++) turned = advanceVisualYaw(turned, Math.PI, .016)
  assert.ok(Math.abs(turned - Math.PI) < .01, 'the fish eventually faces the new direction')
  assert.equal(advanceVisualYaw(0, Math.PI, .016, true), Math.PI, 'reduced motion skips the turn')
  for (const species of ['betta', 'guppy', 'angel', 'tetra', 'discus', 'ram']) {
    const body = bodyEnvelope(species)
    assert.ok(body.every(Number.isFinite) && body[2] > 0 && body[3] > 0 && body[4] > 0)
  }
})

test('overlapping fish separate in the running simulation', () => {
  const tank = load()
  let value = JSON.stringify({
    version: 2, updatedAt: 1000, reserve: 0, tokenSeen: {},
    fish: [{ ...sampleFish, id: 'one' }, { ...sampleFish, id: 'two' }],
  })
  const storage = { getItem: () => value, setItem: (_key, next) => { value = next } }
  const store = tank.createStore({ storage, now: () => 1000, random: () => .5 })
  store.catchUp(1000)
  for (let frame = 1; frame <= 30; frame += 1) store.step(1000 + frame * 16)
  const [first, second] = store.getFish()
  assert.ok(Math.hypot(first.x - second.x, first.y - second.y) > .0001, 'fish no longer occupy exactly the same position')
})

test('the scene renders a moving Canvas fallback when WebGL is unavailable', () => {
  let requests = 0
  const tank = load({ document: { createElement() { requests++; return { getContext: () => null } } } })
  const c = canvas()
  tank.drawScene(c.context, { width: 800, height: 500, dpr: 1 }, { fish: [sampleFish], pellets: [], bubbles: [], ripples: [], splashes: [], ghosts: [], sparkles: [] }, 2000)
  assert.ok(c.calls.length >= 20, 'fish strips are rendered')
  tank.drawScene(c.context, { width: 800, height: 500, dpr: 1 }, { fish: [sampleFish], pellets: [], bubbles: [], ripples: [], splashes: [], ghosts: [], sparkles: [] }, 2016)
  assert.equal(requests, 1, 'unsupported WebGL is not retried every frame')
})
