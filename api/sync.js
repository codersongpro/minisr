import crypto from 'node:crypto';
import { hasValidSession, isSameOrigin } from './_auth.js';

const CODE_PATTERN = /^\d{4}$/;
const RATE_LIMIT = { create: 5, join: 10 };
const RATE_WINDOW_MS = 60 * 60 * 1000;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.headers?.['x-real-ip'] || 'unknown';
}

// 저장소를 주입받아 테스트에서는 Firebase Admin 없이 검증할 수 있게 한다.
export function createSyncHandler(loadStore) {
  return async function handler(req, res) {
    if (req.method !== 'POST' || !isSameOrigin(req)) return json(res, 405, { error: '요청을 처리할 수 없습니다.' });
    if (!(await hasValidSession(req))) return json(res, 401, { error: '인증이 필요합니다.' });

    const { action, code, idToken } = req.body || {};
    if (action !== 'create' && action !== 'join') return json(res, 400, { error: '지원하지 않는 요청입니다.' });
    if (action === 'join' && (typeof code !== 'string' || !CODE_PATTERN.test(code))) {
      return json(res, 400, { error: '동기화 코드는 숫자 4자리입니다.' });
    }
    if (idToken !== undefined && (typeof idToken !== 'string' || idToken.length > 4096)) {
      return json(res, 400, { error: '요청이 올바르지 않습니다.' });
    }

    const store = await loadStore();
    if (!store.isConfigured()) return json(res, 503, { error: 'FIREBASE_SERVICE_ACCOUNT_KEY가 설정되지 않았습니다.' });

    try {
      const limitKey = crypto.createHash('sha256').update(`${action}:${clientIp(req)}`).digest('hex');
      if (!(await store.consumeRateLimit(limitKey, RATE_LIMIT[action], RATE_WINDOW_MS))) {
        return json(res, 429, { error: '시도 횟수가 너무 많습니다. 1시간 뒤에 다시 시도해주세요.' });
      }

      let syncCode = code;
      if (action === 'create') {
        syncCode = await store.createSyncCode();
      } else if (!(await store.syncCodeExists(code))) {
        return json(res, 404, { error: '등록되지 않은 동기화 코드입니다.' });
      }

      // 이 기기에서 익명으로 저장한 기록을 코드 계정으로 옮긴다.
      const fromUid = idToken ? await store.anonymousUidFromToken(idToken) : null;
      if (fromUid) await store.moveSessions(fromUid, `sync_${syncCode}`);

      return json(res, 200, { code: syncCode, token: await store.createLoginToken(syncCode) });
    } catch (error) {
      console.error('Sync request failed:', error instanceof Error ? error.message : String(error));
      return json(res, 500, { error: '동기화에 실패했습니다. 잠시 후 다시 시도해주세요.' });
    }
  };
}

export default createSyncHandler(() => import('./_syncStore.js'));
