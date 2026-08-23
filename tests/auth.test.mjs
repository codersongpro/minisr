import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSessionToken,
  verifySessionToken,
  passwordsMatch,
  parseCookies,
  SESSION_TTL_MS,
} from '../api/_auth.js';

test('creates and verifies a signed session token', async () => {
  const token = await createSessionToken('session-secret', 1_700_000_000_000);

  assert.equal(await verifySessionToken(token, 'session-secret', 1_700_000_000_000), true);
  assert.equal(await verifySessionToken(token, 'wrong-secret', 1_700_000_000_000), false);
});

test('rejects an expired session token', async () => {
  const token = await createSessionToken('session-secret', 1_700_000_000_000);

  assert.equal(await verifySessionToken(token, 'session-secret', 1_700_000_000_000 + SESSION_TTL_MS + 1), false);
});

test('compares passwords without exposing the configured password', () => {
  assert.equal(passwordsMatch('2420', '2420'), true);
  assert.equal(passwordsMatch('2421', '2420'), false);
  assert.equal(passwordsMatch('', '2420'), false);
});

test('parses only cookie name/value pairs', () => {
  assert.deepEqual(parseCookies('mini_sr_session=abc; theme=dark'), {
    mini_sr_session: 'abc',
    theme: 'dark',
  });
});
