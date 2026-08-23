import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/auth.js';

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    end(body) { this.body = body; },
  };
}

test('rejects cross-origin unlock requests', async () => {
  const previous = { APP_PASSWORD: process.env.APP_PASSWORD, SESSION_SECRET: process.env.SESSION_SECRET };
  process.env.APP_PASSWORD = '2420';
  process.env.SESSION_SECRET = 'test-secret';
  const res = response();

  await handler({ method: 'POST', body: { password: '2420' }, headers: { origin: 'https://evil.example', host: 'app.example' } }, res);

  assert.equal(res.statusCode, 405);
  restore('APP_PASSWORD', previous.APP_PASSWORD);
  restore('SESSION_SECRET', previous.SESSION_SECRET);
});

test('sets an HttpOnly session cookie after a valid unlock', async () => {
  const previous = { APP_PASSWORD: process.env.APP_PASSWORD, SESSION_SECRET: process.env.SESSION_SECRET };
  process.env.APP_PASSWORD = '2420';
  process.env.SESSION_SECRET = 'test-secret';
  const res = response();

  await handler({ method: 'POST', body: { password: '2420' }, headers: { origin: 'https://app.example', host: 'app.example' } }, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Set-Cookie'], /mini_sr_session=.*HttpOnly/);
  assert.deepEqual(JSON.parse(res.body), { authenticated: true });
  restore('APP_PASSWORD', previous.APP_PASSWORD);
  restore('SESSION_SECRET', previous.SESSION_SECRET);
});
