import crypto from 'node:crypto';
import { createSessionToken, getCookieHeader, isSameOrigin, passwordsMatch } from './_auth.js';

const CODE_PATTERN = /^\d{4}$/;
const RATE_LIMIT = 10; // IP당 시간당 관리자 로그인 시도
const RATE_WINDOW_MS = 60 * 60 * 1000;

function json(res, status, body, headers = {}) {
  res.status(status).setHeader('Content-Type', 'application/json');
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(body));
}

function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.headers?.['x-real-ip'] || 'unknown';
}

// 관리자 로그인: 관리자 비밀번호 + 4자리 동기화 코드.
// 성공하면 앱 입장 세션을 열고, 같은 코드의 기기들이 함께 쓰는 Firebase 계정 토큰을 발급한다.
// 저장소를 주입받아 테스트에서는 Firebase Admin 없이 검증할 수 있게 한다.
export function createSyncHandler(loadStore) {
  return async function handler(req, res) {
    if (req.method !== 'POST' || !isSameOrigin(req)) return json(res, 405, { error: '요청을 처리할 수 없습니다.' });

    const { password, code, idToken } = req.body || {};
    if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
      return json(res, 400, { error: '동기화 코드는 숫자 4자리입니다.' });
    }
    if (typeof password !== 'string' || (idToken !== undefined && (typeof idToken !== 'string' || idToken.length > 4096))) {
      return json(res, 400, { error: '요청이 올바르지 않습니다.' });
    }

    const adminPassword = process.env.ADMIN_PASSWORD;
    const sessionSecret = process.env.SESSION_SECRET;
    if (!adminPassword || !sessionSecret) return json(res, 503, { error: '관리자 비밀번호가 설정되지 않았습니다.' });

    const store = await loadStore();
    if (!store.isConfigured()) return json(res, 503, { error: 'FIREBASE_SERVICE_ACCOUNT_KEY가 설정되지 않았습니다.' });

    try {
      const limitKey = crypto.createHash('sha256').update(`admin:${clientIp(req)}`).digest('hex');
      if (!(await store.consumeRateLimit(limitKey, RATE_LIMIT, RATE_WINDOW_MS))) {
        return json(res, 429, { error: '시도 횟수가 너무 많습니다. 1시간 뒤에 다시 시도해주세요.' });
      }
      if (!passwordsMatch(password, adminPassword)) {
        return json(res, 401, { error: '관리자 비밀번호가 올바르지 않습니다.' });
      }

      await store.ensureSyncCode(code);
      // 이 기기에서 익명으로 저장해 온 기록(코드 도입 전 기록 포함)을 코드 계정으로 옮긴다.
      const fromUid = idToken ? await store.anonymousUidFromToken(idToken) : null;
      if (fromUid) await store.moveSessions(fromUid, `sync_${code}`);

      const session = await createSessionToken(sessionSecret);
      return json(res, 200, { code, token: await store.createLoginToken(code) }, { 'Set-Cookie': getCookieHeader(session, true) });
    } catch (error) {
      console.error('Sync request failed:', error instanceof Error ? error.message : String(error));
      return json(res, 500, { error: '동기화에 실패했습니다. 잠시 후 다시 시도해주세요.' });
    }
  };
}

export default createSyncHandler(() => import('./_syncStore.js'));
