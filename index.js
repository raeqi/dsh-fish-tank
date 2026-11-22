/**
 * Host half of the fish-tank bundle.
 *
 * The tank itself is simulated in the Client module; this half gives that state
 * a durable home outside the browser: one JSON file that the page reads on open
 * and writes back after it changes. The file is the migration unit — copy it to
 * another machine, or point `statePath` at a synchronized folder, and every
 * browser that reaches this Host sees the same tank.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

/** Exact path the Client page reads and writes. */
export const STATE_ROUTE = '/fish-tank/state'

/** Largest accepted snapshot; the real tank is a few kilobytes. */
const MAX_BODY_BYTES = 256 * 1024

/** Fingerprint of the file format this half writes and reads. */
const FILE_VERSION = 1

export const inject = ['webServer']

/**
 * Default tank location inside the Harness home directory.
 * @param env - process environment that may carry `DSH_HOME`.
 * @param home - fallback home directory.
 * @returns absolute path of the default tank file.
 */
export function defaultStatePath(env, home) {
  const configured = env !== undefined && typeof env.DSH_HOME === 'string' && env.DSH_HOME !== ''
    ? env.DSH_HOME
    : join(home === undefined ? homedir() : home, '.dsh')
  return join(configured, 'fish-tank', 'tank.json')
}

/**
 * Resolve the configured tank path.
 * @param config - the Loader row's `config` object, when present.
 * @param env - process environment used for the default.
 * @returns absolute path of the tank file.
 */
export function resolveStatePath(config, env) {
  const configured = config !== null && typeof config === 'object' ? config.statePath : undefined
  if (configured === undefined) return defaultStatePath(env)
  if (typeof configured !== 'string' || configured === '') {
    throw new Error('fish-tank: config.statePath must be a non-empty absolute path')
  }
  if (!isAbsolute(configured)) {
    throw new Error('fish-tank: config.statePath must be absolute, got ' + JSON.stringify(configured))
  }
  return configured
}

/**
 * One tank file: whole-file reads, atomic replaced writes.
 * @param path - absolute path of the JSON file.
 * @returns reader and writer bound to that path.
 */
export function createTankFile(path) {
  async function read() {
    let text
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      if (error !== null && error.code === 'ENOENT') return null
      throw error
    }
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      throw new Error('fish-tank: ' + path + ' is not valid JSON: ' + (error instanceof Error ? error.message : String(error)))
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('fish-tank: ' + path + ' must hold one tank object')
    }
    return parsed
  }

  async function write(tank) {
    await mkdir(dirname(path), { recursive: true })
    const temporary = path + '.' + process.pid + '.tmp'
    await writeFile(temporary, JSON.stringify(tank, null, 2) + '\n', 'utf8')
    await rename(temporary, path)
  }

  return { path, read, write }
}

/**
 * Answer one request against the tank file.
 * GET returns the stored tank (or null); POST accepts a newer snapshot.
 * @param file - tank file bound to the configured path.
 * @param req - incoming HTTP request.
 * @param res - response to complete.
 */
export async function handleStateRequest(file, req, res) {
  const send = (status, body) => {
    const payload = JSON.stringify(body)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(payload),
    })
    res.end(payload)
  }
  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const tank = await file.read()
      send(200, { path: file.path, tank: tank })
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'GET, HEAD, POST', 'cache-control': 'no-store' })
      res.end()
      return
    }
    const text = await readBody(req)
    let incoming
    try {
      incoming = JSON.parse(text)
    } catch (error) {
      send(400, { error: 'body is not JSON' })
      return
    }
    if (incoming === null || typeof incoming !== 'object' || Array.isArray(incoming)
      || typeof incoming.updatedAt !== 'number' || !isFinite(incoming.updatedAt)) {
      send(400, { error: 'body must be one tank snapshot with updatedAt' })
      return
    }
    const stored = await file.read()
    if (stored !== null && typeof stored.updatedAt === 'number' && stored.updatedAt > incoming.updatedAt) {
      send(200, { saved: false, path: file.path, updatedAt: stored.updatedAt, tank: stored })
      return
    }
    const snapshot = Object.assign({}, incoming, { fileVersion: FILE_VERSION })
    await file.write(snapshot)
    send(200, { saved: true, path: file.path, updatedAt: snapshot.updatedAt })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!res.headersSent) send(500, { error: message })
    else res.end()
  }
}

/** Read a bounded request body as UTF-8 text. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('fish-tank: snapshot exceeds ' + MAX_BODY_BYTES + ' bytes'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * Mount the tank file route.
 * @param ctx - Host plugin context carrying the Web server.
 * @param config - Loader row config, optionally carrying `statePath`.
 */
export function apply(ctx, config) {
  const file = createTankFile(resolveStatePath(config, process.env))
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: STATE_ROUTE,
    auth: 'required',
    handler: (req, res) => handleStateRequest(file, req, res),
  }), 'fish-tank: tank file route')
}
