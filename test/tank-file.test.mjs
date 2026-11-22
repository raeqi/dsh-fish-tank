/**
 * Host half behavior: the tank file round-trips, the route accepts newer
 * snapshots only, and misconfiguration fails loudly.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

import {
  STATE_ROUTE,
  apply,
  createTankFile,
  defaultStatePath,
  handleStateRequest,
  resolveStatePath,
} from '../index.js'

async function tankPath() {
  const directory = await mkdtemp(join(tmpdir(), 'fish-tank-'))
  return join(directory, 'tank.json')
}

function request(method, body) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(body)])
  stream.method = method
  return stream
}

function response() {
  const captured = { status: 0, headers: {}, body: '', headersSent: false }
  return {
    captured,
    writeHead(status, headers) {
      captured.status = status
      captured.headers = headers ?? {}
      captured.headersSent = true
    },
    end(chunk) {
      captured.headersSent = true
      if (chunk !== undefined) captured.body = String(chunk)
    },
  }
}

const snapshot = (updatedAt, fish = 3) => ({
  version: 2,
  updatedAt,
  fish: Array.from({ length: fish }, (_, index) => ({
    id: 'f' + index, x: 0.5, y: 0.5, angle: 0, growth: 0.5, hunger: 0.4, hue: 20, species: 0, seed: index,
  })),
  reserve: 3,
  tokenSeen: { s1: 1000 },
  tokensCounted: 1000,
  tokenRemainder: 0,
  autoFed: 1,
  manualFed: 2,
  birthProgress: 0,
  lastBirthAt: 0,
})

test('the tank file round-trips one snapshot', async () => {
  const path = await tankPath()
  const file = createTankFile(path)
  assert.equal(await file.read(), null)
  await file.write(snapshot(1000))
  const stored = await file.read()
  assert.equal(stored.updatedAt, 1000)
  assert.equal(stored.fish.length, 3)
  const text = await readFile(path, 'utf8')
  assert.match(text, /"reserve": 3/)
  assert.equal(text.endsWith('\n'), true)
})

test('an unreadable tank file fails loudly instead of starting empty', async () => {
  const path = await tankPath()
  await writeFile(path, '{ not json', 'utf8')
  await assert.rejects(() => createTankFile(path).read(), /not valid JSON/)
})

test('the default path lives under the Harness home', () => {
  assert.equal(defaultStatePath({ DSH_HOME: '/dsh' }, '/home/u'), '/dsh/fish-tank/tank.json')
  assert.equal(defaultStatePath({}, '/home/u'), '/home/u/.dsh/fish-tank/tank.json')
})

test('a configured state path must be absolute', () => {
  assert.equal(resolveStatePath({ statePath: '/tmp/t.json' }, {}), '/tmp/t.json')
  assert.throws(() => resolveStatePath({ statePath: 'relative/t.json' }, {}), /must be absolute/)
  assert.throws(() => resolveStatePath({ statePath: 3 }, {}), /non-empty absolute path/)
})

test('GET returns the stored tank with its path', async () => {
  const path = await tankPath()
  const file = createTankFile(path)
  await file.write(snapshot(2000))
  const res = response()
  await handleStateRequest(file, request('GET'), res)
  assert.equal(res.captured.status, 200)
  const payload = JSON.parse(res.captured.body)
  assert.equal(payload.path, path)
  assert.equal(payload.tank.updatedAt, 2000)
})

test('POST stores a newer snapshot and refuses an older one', async () => {
  const path = await tankPath()
  const file = createTankFile(path)
  const first = response()
  await handleStateRequest(file, request('POST', JSON.stringify(snapshot(3000))), first)
  assert.equal(JSON.parse(first.captured.body).saved, true)
  assert.equal((await file.read()).updatedAt, 3000)

  const stale = response()
  await handleStateRequest(file, request('POST', JSON.stringify(snapshot(2000))), stale)
  const staleBody = JSON.parse(stale.captured.body)
  assert.equal(staleBody.saved, false)
  assert.equal(staleBody.updatedAt, 3000)
  assert.equal((await file.read()).updatedAt, 3000)
})

test('bad requests are rejected without touching the file', async () => {
  const path = await tankPath()
  const file = createTankFile(path)
  const put = response()
  await handleStateRequest(file, request('PUT'), put)
  assert.equal(put.captured.status, 405)

  const malformed = response()
  await handleStateRequest(file, request('POST', 'nope'), malformed)
  assert.equal(malformed.captured.status, 400)

  const noStamp = response()
  await handleStateRequest(file, request('POST', JSON.stringify({ fish: [] })), noStamp)
  assert.equal(noStamp.captured.status, 400)
  assert.equal(await file.read(), null)
})

test('the route path is stable for the Client half', () => {
  assert.equal(STATE_ROUTE, '/fish-tank/state')
})

test('apply registers one exact, peer-gated route and disposes it', () => {
  const registered = []
  const disposed = []
  const ctx = {
    effect(run) { disposed.push(run()) },
    webServer: {
      register(route) {
        registered.push(route)
        return () => { registered.pop() }
      },
    },
  }
  apply(ctx, { statePath: join(tmpdir(), 'fish-tank-registered.json') })
  assert.equal(registered.length, 1)
  assert.equal(registered[0].kind, 'exact')
  assert.equal(registered[0].path, STATE_ROUTE)
  assert.equal(registered[0].auth, 'required')
  assert.equal(typeof registered[0].handler, 'function')
  assert.equal(disposed.length, 1)
  disposed[0]()
  assert.equal(registered.length, 0)
})
