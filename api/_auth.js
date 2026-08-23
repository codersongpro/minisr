import crypto from 'node:crypto';

export const SESSION_COOKIE = 'mini_sr_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

export async function createSessionToken(secret, now = Date.now(), ttlMs = SESSION_TTL_MS) {
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  const expiresAt = Math.floor((now + ttlMs) / 1000);
  const payload = String(expiresAt);
  return `${payload}.${sign(payload, secret)}`;
}

export async function verifySessionToken(token, secret, now = Date.now()) {
  if (!token || !secret) return false;
  const [expiresAt, signature] = token.split('.');
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) <= Math.floor(now / 1000)) return false;

  const expected = sign(expiresAt, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function passwordsMatch(input, configured) {
  if (typeof input !== 'string' || typeof configured !== 'string' || !configured) return false;
  const inputHash = crypto.createHash('sha256').update(input).digest();
  const configuredHash = crypto.createHash('sha256').update(configured).digest();
  return crypto.timingSafeEqual(inputHash, configuredHash);
}

export function parseCookies(header = '') {
  return header.split(';').reduce((cookies, pair) => {
    const separator = pair.indexOf('=');
    if (separator < 0) return cookies;
    const key = pair.slice(0, separator).trim();
    if (!key) return cookies;
    cookies[key] = decodeURIComponent(pair.slice(separator + 1).trim());
    return cookies;
  }, {});
}

export function getCookieHeader(token, secure = true) {
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (secure) flags.push('Secure');
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${flags.join('; ')}`;
}

export function getClearCookieHeader(secure = true) {
  return getCookieHeader('', secure) + '; Max-Age=0';
}

export async function hasValidSession(req) {
  const cookies = parseCookies(req.headers?.cookie || '');
  return verifySessionToken(cookies[SESSION_COOKIE], process.env.SESSION_SECRET);
}

export function isSameOrigin(req) {
  const origin = req.headers?.origin;
  const host = req.headers?.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
