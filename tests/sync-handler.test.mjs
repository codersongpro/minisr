import test from 'node:test';
import assert from 'node:assert/strict';

import { createSyncHandler } from '../api/sync.js';
import { createSessionToken } from '../api/_auth.js';

process.env.SESSION_SECRET = 'test-secret';

function response() {
  return {
    statusCode: 200, headers: {}, body: '',
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    end(body) { this.body = body; },
  };
}

function fakeStore(overrides = {}) {
  const calls = { moved: [], tokens: [] };
  const store = {
    isConfigured: () => true,
    consumeRateLimit: async () => true,
    createSyncCode: async () => '0427',
    syncCodeExists: async (code) => code === '1234',
    anonymousUidFromToken: async (token) => (token === 'anon-token' ? 'anon-uid' : null),
    moveSessions: async (from, to) => { calls.moved.push([from, to]); return 2; },
    createLoginToken: async (code) => { calls.tokens.push(code); return `token-${code}`; },
    ...overrides,
  };
  return { store, calls };
}

async function call(store, body, { session = true, origin = 'https://app.example' } = {}) {
  const cookie = session ? `mini_sr_session=${encodeURIComponent(await createSessionToken('test-secret'))}` : '';
  const res = response();
  await createSyncHandler(async () => store)({ method: 'POST', body, headers: { origin, host: 'app.example', cookie, 'x-forwarded-for': '1.2.3.4' } }, res);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

test('rejects cross-origin and unauthenticated requests', async () => {
  const { store } = fakeStore();
  assert.equal((await call(store, { action: 'create' }, { origin: 'https://evil.example' })).status, 405);
  assert.equal((await call(store, { action: 'create' }, { session: false })).status, 401);
});

test('join requires exactly four digits', async () => {
  const { store } = fakeStore();
  for (const code of ['123', '12345', 'abcd', 1234, undefined]) {
    assert.equal((await call(store, { action: 'join', code })).status, 400, String(code));
  }
});

test('create returns a new code with a login token and moves anonymous records', async () => {
  const { store, calls } = fakeStore();
  const result = await call(store, { action: 'create', idToken: 'anon-token' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { code: '0427', token: 'token-0427' });
  assert.deepEqual(calls.moved, [['anon-uid', 'sync_0427']]);
});

test('join with an unknown code is rejected without moving records', async () => {
  const { store, calls } = fakeStore();
  const result = await call(store, { action: 'join', code: '9999', idToken: 'anon-token' });
  assert.equal(result.status, 404);
  assert.equal(calls.moved.length, 0);
  assert.equal(calls.tokens.length, 0);
});

test('join does not move records from a non-anonymous account', async () => {
  const { store, calls } = fakeStore();
  const result = await call(store, { action: 'join', code: '1234', idToken: 'other-code-token' });
  assert.equal(result.status, 200);
  assert.equal(calls.moved.length, 0);
});

test('rate limit blocks repeated attempts', async () => {
  const { store } = fakeStore({ consumeRateLimit: async () => false });
  assert.equal((await call(store, { action: 'join', code: '1234' })).status, 429);
});

test('reports missing service account configuration', async () => {
  const { store } = fakeStore({ isConfigured: () => false });
  assert.equal((await call(store, { action: 'create' })).status, 503);
});
