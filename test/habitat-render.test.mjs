import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

test('the shipped renderer paints and caches distinct milestone habitats behind the fish', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const layers = []
  const painted = []
  function context(record, render) {
    return new Proxy({}, {
      get(target, name) {
        if (name in target) return target[name]
        if (name === 'createLinearGradient' || name === 'createRadialGradient') {
          return () => ({ addColorStop: (...args) => record?.push(['color', ...args]) })
        }
        if (name === 'drawImage' && render) return canvas => painted.push(canvas)
        return (...args) => record?.push([name, ...args])
      },
    })
  }
  const globals = {
    window: { __ModuleLoader__: { load() {} } },
    document: { createElement(tag) {
      // WebGL can also probe for a canvas; count only surfaces painted in 2D.
      assert.equal(tag, 'canvas')
      const operations = []
      const canvas = { operations, getContext(kind) {
        if (kind !== '2d') return null
        layers.push(canvas)
        return context(operations)
      } }
      return canvas
    } },
    console,
  }
  vm.runInNewContext(source, globals)
  const store = globals.DshFishTank.createStore({ storage: null, now: () => 1000 })
  store.catchUp(1000)
  const display = context(null, true)
  const view = { width: 1000, height: 560, reducedMotion: true }
  store.absorbAccountTotal('habitat-test', 48999999)
  globals.DshFishTank.drawScene(display, view, store.getScene(), 1000)
  assert.equal(painted.length, 0)
  for (const [level, expectedLayers] of [[50, 1], [100, 2], [150, 3], [200, 4]]) {
    store.absorbAccountTotal('habitat-test', (level - 1) * 1000000)
    const scene = store.getScene()
    globals.DshFishTank.drawScene(display, view, scene, 1000)
    globals.DshFishTank.drawScene(display, { ...view, width: 800 }, scene, 1016)
    assert.equal(layers.length, expectedLayers)
    assert.equal(painted.at(-1), layers.at(-1), 'same offscreen layer reused on the resized frame')
    assert.equal(scene.fish.length, 3)
  }
  assert.equal(new Set(layers.map(layer => JSON.stringify(layer.operations))).size, 4, 'all four milestones paint distinct layouts')
})
