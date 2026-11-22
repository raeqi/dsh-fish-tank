import assert from 'node:assert/strict'
import test from 'node:test'
import { createAccountCloud, readAccountUsage, createSourceResolver } from '../account-source.js'

test('unsupported official account usage remains explicitly unavailable', async () => {
  assert.deepEqual(await readAccountUsage(undefined), { status: 'unavailable' })
  assert.deepEqual(await readAccountUsage({ getPlatformSession: async () => ({ userId: 'alice', origin: 'https://platform.deepseek.com', token: 'private-grant' }) }), { status: 'unavailable', id: 'alice' })
})

test('account usage can only send its grant to its own configured Platform origin', async () => {
  const account = { getPlatformSession: async () => ({ userId: 'alice', origin: 'https://platform.deepseek.com', token: 'private-grant' }) }
  await assert.rejects(readAccountUsage(account, '//other.example/usage'))
  const usage = await readAccountUsage(account, '/known-account-usage', async (url, init) => {
    assert.equal(url, 'https://platform.deepseek.com/known-account-usage')
    assert.equal(init.redirect, 'error')
    assert.equal(init.headers['x-dsh-auth-token'], 'private-grant')
    return { ok: true, json: async () => ({ accountId: 'alice', totalTokens: 12345678 }) }
  })
  assert.deepEqual(usage, { status: 'ready', id: 'alice', totalTokens: 12345678 })
})

test('configured cloud state and usage are shared between independent clients with revision protection', async () => {
  let revision = 0, tank = null
  const request = async (_url, init) => {
    assert.equal(init.headers.authorization, 'Bearer dedicated-cloud-token')
    assert.equal(init.headers['x-dsh-auth-token'], undefined, 'never forwards the Platform grant')
    assert.equal(init.headers['x-fish-account-id'], 'alice')
    if (init.method === 'POST') {
      const body = JSON.parse(init.body)
      if (body.revision !== revision) return { status: 409, ok: false }
      tank = body.tank
      revision += 1
    }
    return { ok: true, json: async () => ({ accountId: 'alice', revision, totalTokens: 2000000, tank }) }
  }
  const options = { url: 'https://fish.example/state', token: 'dedicated-cloud-token', accountId: 'alice', request }
  const first = createAccountCloud(options), second = createAccountCloud(options)
  await first.read()
  await second.read()
  await first.write({ updatedAt: 1000, fish: [{ id: 'same-fish' }], game: { garden: { patches: 6 } } })
  await assert.rejects(second.write({ updatedAt: 1001, fish: [] }), /revision conflict/)
  const shared = await second.read()
  assert.equal(shared.fish[0].id, 'same-fish')
  assert.equal(shared.game.garden.patches, 6)
  assert.equal(second.metadata().sync, 'cloud')
  assert.equal(second.metadata().account.totalTokens, 2000000)
})

test('wrong-account responses are rejected and unencrypted remote services are refused', async () => {
  assert.throws(() => createAccountCloud({ url: 'http://public.example/state', token: 'x', accountId: 'alice' }))
  const file = createAccountCloud({ url: 'https://fish.example/state', token: 'x', accountId: 'alice', request: async () => ({ ok: true, json: async () => ({ accountId: 'bob', revision: 1, tank: {} }) }) })
  await assert.rejects(file.read(), /identity/)
})


test('remote account source configuration is validated before registering routes',()=>{
  assert.throws(()=>createSourceResolver({}, {cloudStateURL:'http://public.example/state',cloudToken:'private'}, {}))
  assert.throws(()=>createSourceResolver({}, {accountUsagePath:'//untrusted.example/path'}, {}))
})
