import { doc, setDoc, getDocs, collection, query, where, orderBy, deleteDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { TestSession } from '../types';

const LOCAL_STORAGE_KEY = 'mini_sr_test_sessions';

// Helper to get sessions from localStorage
export function getLocalSessions(): TestSession[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("Error reading localStorage sessions:", e);
    return [];
  }
}

// Helper to save sessions to localStorage
export function saveLocalSession(session: TestSession) {
  try {
    const existing = getLocalSessions();
    const index = existing.findIndex(s => s.id === session.id);
    if (index >= 0) {
      existing[index] = session;
    } else {
      existing.unshift(session);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existing));
  } catch (e) {
    console.error("Error writing localStorage session:", e);
  }
}

export function deleteLocalSession(sessionId: string) {
  try {
    const existing = getLocalSessions();
    const filtered = existing.filter(s => s.id !== sessionId);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error("Error deleting localStorage session:", e);
  }
}

// Save or Update Test Session (Auto-saves progress or completion)
export async function saveTestSession(session: TestSession): Promise<void> {
  // Always update local storage for immediate offline/instant access
  saveLocalSession(session);

  // Sync to Firestore if user is authenticated
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const path = `testSessions/${session.id}`;
  try {
    const sessionData = {
      ...session,
      userId: currentUser.uid,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'testSessions', session.id), sessionData, { merge: true });
  } catch (error) {
    console.error("Failed to sync session to Firestore:", error);
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Fetch all saved sessions (ordered by date/time descending)
export async function fetchUserTestSessions(): Promise<TestSession[]> {
  const localSessions = getLocalSessions();
  const currentUser = auth.currentUser;

  if (!currentUser) {
    return localSessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  const path = 'testSessions';
  try {
    const q = query(
      collection(db, path),
      where('userId', '==', currentUser.uid),
      orderBy('updatedAt', 'desc')
    );
    const snapshot = await getDocs(q);
    const firestoreSessions: TestSession[] = [];
    
    snapshot.forEach(docSnap => {
      firestoreSessions.push(docSnap.data() as TestSession);
    });

    // Merge Firestore and local sessions (prioritize Firestore or newest)
    const map = new Map<string, TestSession>();
    localSessions.forEach(s => map.set(s.id, s));
    firestoreSessions.forEach(s => map.set(s.id, s));

    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    // Keep localStorage updated with merged data
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch (error) {
    console.warn("Could not fetch sessions from Firestore, falling back to localStorage:", error);
    return localSessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
}

// Delete a session
export async function removeTestSession(sessionId: string): Promise<void> {
  deleteLocalSession(sessionId);
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const path = `testSessions/${sessionId}`;
  try {
    await deleteDoc(doc(db, 'testSessions', sessionId));
  } catch (error) {
    console.error("Failed to delete session from Firestore:", error);
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// 동기화 코드를 바꾸거나 해제할 때, 이 기기에 남은 다른 코드의 기록을 지운다.
export function clearLocalSessions() {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (e) {
    console.error("Error clearing localStorage sessions:", e);
  }
}

// 이 기기에만 있던 기록을 현재 계정(동기화 코드)으로 올린다.
export async function uploadLocalSessions(): Promise<void> {
  for (const session of getLocalSessions()) {
    await saveTestSession(session);
  }
}
