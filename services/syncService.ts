import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { clearLocalSessions, uploadLocalSessions } from './storageService';

const SYNC_UID_PREFIX = 'sync_';

// 같은 동기화 코드로 관리자 로그인한 기기들은 모두 같은 Firebase 계정(sync_코드)을 쓴다.
export const syncCodeFromUid = (uid: string | null | undefined) =>
  uid && uid.startsWith(SYNC_UID_PREFIX) ? uid.slice(SYNC_UID_PREFIX.length) : null;

// 관리자 비밀번호 + 4자리 코드로 로그인한다. 성공하면 앱 입장 세션도 함께 열린다.
export async function adminSyncLogin(password: string, code: string): Promise<void> {
  await auth.authStateReady();
  const user = auth.currentUser;
  // 익명 계정일 때만 ID 토큰을 보내, 이 기기에서 풀었던 기존 기록을 코드로 옮긴다.
  const idToken = user?.isAnonymous ? await user.getIdToken().catch(() => undefined) : undefined;
  const switchingCodes = !!syncCodeFromUid(user?.uid) && syncCodeFromUid(user?.uid) !== code;

  const response = await fetch('/api/sync', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, code, idToken }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : '관리자 로그인에 실패했습니다.');

  // 다른 코드에서 넘어오는 경우 이전 코드의 기록이 새 코드로 섞이지 않게 이 기기에서 지운다.
  if (switchingCodes) clearLocalSessions();
  await signInWithCustomToken(auth, payload.token);
  // 이 기기에만 있던 기록(서버 저장 전 기록 포함)도 코드 계정에 올린다.
  await uploadLocalSessions();
}

// 이 기기만 동기화를 해제한다. 기록은 코드에 남아 다른 기기에서 계속 볼 수 있다.
export async function leaveSyncCode(): Promise<void> {
  clearLocalSessions();
  await signOut(auth);
}
