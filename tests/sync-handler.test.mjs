import test from 'node:test';
import assert from 'node:assert/strict';

import { createSyncHandler } from '../api/sync.js';

process.env.SESSION_SECRET = 'test-secret';
process.env.ADMIN_PASSWORD = 'admin-pass';

function response() {
  return {
    statusCode: 200, headers: {}, body: '',
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    end(body) { this.body = body; },
  };
}

function fakeStore(overrides = {}) {
  const calls = { moved: [], tokens: [], ensured: [] };
  const store = {
    isConfigured: () => true,
    consumeRateLimit: async () => true,
    ensureSyncCode: async (code) => { calls.ensured.push(code); },
    anonymousUidFromToken: async (token) => (token === 'anon-token' ? 'anon-uid' : null),
    moveSessions: async (from, to) => { calls.moved.push([from, to]); return 2; },
    createLoginToken: async (code) => { calls.tokens.push(code); return `token-${code}`; },
    ...overrides,
  };
  return { store, calls };
}

async function call(store, body, origin = 'https://app.example') {
  const res = response();
  await createSyncHandler(async () => store)({ method: 'POST', body, headers: { origin, host: 'app.example', 'x-forwarded-for': '1.2.3.4' } }, res);
  return { status: res.statusCode, body: JSON.parse(res.body), headers: res.headers };
}

test('rejects cross-origin requests', async () => {
  const { store } = fakeStore();
  assert.equal((await call(store, { password: 'admin-pass', code: '1234' }, 'https://evil.example')).status, 405);
});

test('code must be exactly four digits', async () => {
  const { store } = fakeStore();
  for (const code of ['123', '12345', 'abcd', 1234, undefined]) {
    assert.equal((await call(store, { password: 'admin-pass', code })).status, 400, String(code));
  }
});

test('the regular entry password is not accepted for admin login', async () => {
  process.env.APP_PASSWORD = 'family-pass';
  const { store, calls } = fakeStore();
  const result = await call(store, { password: 'family-pass', code: '1234', idToken: 'anon-token' });
  assert.equal(result.status, 401);
  assert.equal(calls.tokens.length, 0);
  assert.equal(calls.moved.length, 0);
  assert.equal(result.headers['Set-Cookie'], undefined);
});

test('admin login opens an app session, moves this device records, and returns a login token', async () => {
  const { store, calls } = fakeStore();
  const result = await call(store, { password: 'admin-pass', code: '0427', idToken: 'anon-token' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { code: '0427', token: 'token-0427' });
  assert.deepEqual(calls.ensured, ['0427']);
  assert.deepEqual(calls.moved, [['anon-uid', 'sync_0427']]);
  assert.match(result.headers['Set-Cookie'], /mini_sr_session=.*HttpOnly/);
});

test('records from another code account are never moved', async () => {
  const { store, calls } = fakeStore();
  const result = await call(store, { password: 'admin-pass', code: '1234', idToken: 'other-code-token' });
  assert.equal(result.status, 200);
  assert.equal(calls.moved.length, 0);
});

test('rate limit blocks repeated attempts', async () => {
  const { store } = fakeStore({ consumeRateLimit: async () => false });
  assert.equal((await call(store, { password: 'admin-pass', code: '1234' })).status, 429);
});

test('reports missing configuration', async () => {
  const { store } = fakeStore({ isConfigured: () => false });
  assert.equal((await call(store, { password: 'admin-pass', code: '1234' })).status, 503);
  const saved = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  assert.equal((await call(fakeStore().store, { password: 'x', code: '1234' })).status, 503);
  process.env.ADMIN_PASSWORD = saved;
});
