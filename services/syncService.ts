import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { clearLocalSessions, uploadLocalSessions } from './storageService';

const SYNC_UID_PREFIX = 'sync_';

// 같은 동기화 코드를 입력한 기기들은 모두 같은 Firebase 계정(sync_코드)으로 로그인한다.
export const syncCodeFromUid = (uid: string | null | undefined) =>
  uid && uid.startsWith(SYNC_UID_PREFIX) ? uid.slice(SYNC_UID_PREFIX.length) : null;

async function requestSync(action: 'create' | 'join', code?: string) {
  const user = auth.currentUser;
  // 익명 계정일 때만 ID 토큰을 보내 이 기기의 기존 기록을 코드로 옮긴다.
  const idToken = user?.isAnonymous ? await user.getIdToken().catch(() => undefined) : undefined;
  const response = await fetch('/api/sync', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, code, idToken }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : '동기화에 실패했습니다.');
  return payload as { code: string; token: string };
}

async function signInToCode(token: string) {
  await signInWithCustomToken(auth, token);
  await uploadLocalSessions();
}

export async function createSyncCode(): Promise<string> {
  const { code, token } = await requestSync('create');
  await signInToCode(token);
  return code;
}

export async function joinSyncCode(code: string): Promise<void> {
  const switchingCodes = !!syncCodeFromUid(auth.currentUser?.uid);
  const { token } = await requestSync('join', code);
  // 다른 코드에서 넘어오는 경우 이전 코드의 기록이 새 코드로 섞이지 않게 지운다.
  if (switchingCodes) clearLocalSessions();
  await signInToCode(token);
}

// 이 기기만 동기화를 해제한다. 기록은 코드에 남아 다른 기기에서 계속 볼 수 있다.
export async function leaveSyncCode(): Promise<void> {
  clearLocalSessions();
  await signOut(auth);
}
