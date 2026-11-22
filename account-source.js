/** Optional account-owned usage and cloud storage. Credentials remain on the Host. */
function secureURL(value) {
  const url = new URL(value)
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) throw new Error('fish-tank: remote source must use HTTPS')
  return url
}

/** Configured cloud providers own authentication and authoritative account usage. */
export function createAccountCloud({ url, token, accountId, request = fetch }) {
  const endpoint = secureURL(url)
  if (typeof token !== 'string' || !/^[\x21-\x7e]+$/.test(token) || typeof accountId !== 'string' || !accountId) throw new Error('fish-tank: cloud storage needs an account and a Host-only access token')
  let revision = null
  let latestUsage = null
  async function exchange(method, tank) {
    const response = await request(endpoint.href, {
      method, redirect: 'error', signal: AbortSignal.timeout(3500),
      headers: { authorization: 'Bearer ' + token, accept: 'application/json', 'content-type': 'application/json', 'x-fish-account-id': accountId },
      ...(method === 'POST' ? { body: JSON.stringify({ accountId, revision, tank }) } : {}),
    })
    if (response.status === 409) throw new Error('fish-tank: cloud revision conflict; local changes retained')
    if (!response.ok) throw new Error('fish-tank: cloud storage unavailable')
    const data = await response.json()
    if (!data || data.accountId !== accountId || !Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error('fish-tank: cloud identity or revision mismatch')
    if (data.totalTokens !== undefined && (!Number.isSafeInteger(data.totalTokens) || data.totalTokens < 0)) throw new Error('fish-tank: invalid account usage')
    revision = data.revision
    latestUsage = data.totalTokens === undefined ? null : data.totalTokens
    return data
  }
  return {
    path: '',
    requiresRevision: true,
    async read() { const data = await exchange('GET'); return data.tank ?? null },
    async write(tank) {
      if (tank.ownerId && tank.ownerId !== accountId) throw new Error('fish-tank: tank owner mismatch')
      await exchange('POST', tank)
    },
    metadata() { return { sync: 'cloud', revision, account: { id: accountId, status: latestUsage === null ? 'unavailable' : 'ready', totalTokens: latestUsage } } },
  }
}

/** Read only an explicitly configured Platform path; no undocumented endpoints are guessed. */
export async function readAccountUsage(account, path, request = fetch) {
  if (!account || typeof account.getPlatformSession !== 'function') return { status: 'unavailable' }
  const session = await account.getPlatformSession()
  if (!session || !session.userId) return { status: 'signed-out' }
  if (!path) return { status: 'unavailable', id: session.userId }
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('fish-tank: accountUsagePath must be a path on the signed-in Platform origin')
  const origin = secureURL(session.origin)
  const endpoint = new URL(path, origin)
  if (endpoint.origin !== origin.origin) throw new Error('fish-tank: account usage origin mismatch')
  const response = await request(endpoint.href, {
    redirect: 'error', signal: AbortSignal.timeout(3500),
    headers: { ...(session.requestHeaders || {}), 'x-dsh-auth-token': session.token, accept: 'application/json' },
  })
  if (!response.ok) throw new Error('fish-tank: account usage unavailable')
  const data = await response.json()
  const total = data && data.totalTokens
  if (!data || data.accountId !== session.userId || !Number.isSafeInteger(total) || total < 0) throw new Error('fish-tank: invalid account usage response')
  const current = await account.getPlatformSession()
  if (!current || current.userId !== session.userId || current.token !== session.token) return { status: 'unavailable' }
  return { status: 'ready', id: session.userId, totalTokens: total }
}

/** Optional cloud mode requires a real configured service; local mode is never labelled cloud. */
export function createSourceResolver(ctx, config, localFile) {
  if (config.cloudStateURL !== undefined) {
    secureURL(config.cloudStateURL)
    const token = config.cloudToken || process.env.DSH_FISH_TANK_CLOUD_TOKEN
    if (typeof token !== 'string' || !token) throw new Error('fish-tank: configured cloud storage requires DSH_FISH_TANK_CLOUD_TOKEN')
  }
  if (config.accountUsagePath !== undefined && (typeof config.accountUsagePath !== 'string' || !config.accountUsagePath.startsWith('/') || config.accountUsagePath.startsWith('//'))) throw new Error('fish-tank: accountUsagePath must be a same-origin absolute path')
  let cloud = null, cloudAccount = null, usageCache = null, usageAt = 0
  const getAccount = () => typeof ctx.get === 'function' ? ctx.get('deepseekAccount') : undefined
  return async function resolve() {
    const account = config.cloudStateURL || config.accountUsagePath ? getAccount() : undefined
    if (!config.cloudStateURL) {
      localFile.metadata = async () => {
        const identity = account && typeof account.getPlatformSession === 'function' ? await account.getPlatformSession() : null
        if (usageCache && usageCache.id === (identity ? identity.userId : undefined) && Date.now() - usageAt < 60000) return { sync: 'host', account: usageCache }
        let usage
        try { usage = await readAccountUsage(account, config.accountUsagePath) }
        catch { usage = { status: 'unavailable' } }
        usageCache = usage; usageAt = Date.now()
        return { sync: 'host', account: usage }
      }
      return localFile
    }
    const session = account && typeof account.getPlatformSession === 'function' ? await account.getPlatformSession() : null
    if (!session || !session.userId) throw new Error('fish-tank: sign in before using account cloud storage')
    if (cloud === null || cloudAccount !== session.userId) {
      cloudAccount = session.userId
      cloud = createAccountCloud({ url: config.cloudStateURL, token: config.cloudToken || process.env.DSH_FISH_TANK_CLOUD_TOKEN, accountId: session.userId })
    }
    return cloud
  }
}
