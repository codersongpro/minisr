// 동기화 코드용 Firebase Admin 저장소. 서비스 계정 키는 서버 환경변수에만 둔다.
import { createRequire } from 'node:module';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const firebaseConfig = require('../firebase-applet-config.json');

export const SYNC_UID_PREFIX = 'sync_';
const BATCH_LIMIT = 400;

let cached;

function services() {
  if (cached) return cached;
  const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  const app = getApps()[0] || initializeApp({ credential: cert(credentials), projectId: firebaseConfig.projectId });
  cached = { auth: getAuth(app), db: getFirestore(app, firebaseConfig.firestoreDatabaseId) };
  return cached;
}

export const isConfigured = () => {
  try {
    return !!JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || 'null')?.private_key;
  } catch {
    return false;
  }
};

// 익명 계정의 ID 토큰일 때만 uid를 돌려준다. 이미 다른 코드에 묶인 계정의 기록을 옮기지 않기 위해서다.
export async function anonymousUidFromToken(idToken) {
  try {
    const decoded = await services().auth.verifyIdToken(idToken);
    return decoded.firebase?.sign_in_provider === 'anonymous' ? decoded.uid : null;
  } catch {
    return null;
  }
}

// 관리자가 정한 코드의 계정을 만든다. 이미 있으면 그대로 쓴다.
export async function ensureSyncCode(code) {
  try {
    await services().auth.createUser({ uid: SYNC_UID_PREFIX + code });
  } catch (error) {
    if (error?.code !== 'auth/uid-already-exists') throw error;
  }
}

// 이 기기(익명 계정)에서 저장한 기록을 동기화 코드 계정으로 옮긴다.
export async function moveSessions(fromUid, toUid) {
  const { db } = services();
  const snapshot = await db.collection('testSessions').where('userId', '==', fromUid).get();
  for (let i = 0; i < snapshot.docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    snapshot.docs.slice(i, i + BATCH_LIMIT).forEach(doc => batch.update(doc.ref, { userId: toUid }));
    await batch.commit();
  }
  return snapshot.size;
}

export const createLoginToken = (code) => services().auth.createCustomToken(SYNC_UID_PREFIX + code);

// 관리자 비밀번호 대입을 막기 위해 같은 IP의 시도 횟수를 시간당으로 제한한다.
export async function consumeRateLimit(key, limit, windowMs) {
  const { db } = services();
  const ref = db.collection('syncRateLimits').doc(key);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = snap.exists ? snap.data() : null;
    const fresh = !data || now - data.windowStart >= windowMs;
    const count = fresh ? 1 : data.count + 1;
    tx.set(ref, { windowStart: fresh ? now : data.windowStart, count });
    return count <= limit;
  });
}
