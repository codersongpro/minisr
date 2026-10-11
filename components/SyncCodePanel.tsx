import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2, RefreshCw } from 'lucide-react';
import { auth } from '../services/firebase';
import { createSyncCode, joinSyncCode, leaveSyncCode, syncCodeFromUid } from '../services/syncService';

interface SyncCodePanelProps {
  onSynced: () => void;
}

export const SyncCodePanel: React.FC<SyncCodePanelProps> = ({ onSynced }) => {
  const [code, setCode] = useState<string | null>(syncCodeFromUid(auth.currentUser?.uid));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => onAuthStateChanged(auth, user => setCode(syncCodeFromUid(user?.uid))), []);

  const run = async (task: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ text: await task(), error: false });
      onSynced();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : '동기화에 실패했습니다.', error: true });
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () => run(async () => {
    const created = await createSyncCode();
    return `동기화 코드 ${created}이(가) 만들어졌어요. 다른 기기에서 이 코드를 입력하세요.`;
  });

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(input)) {
      setMessage({ text: '숫자 4자리를 입력해주세요.', error: true });
      return;
    }
    run(async () => {
      await joinSyncCode(input);
      setInput('');
      return '연결되었어요. 이 기기의 기록도 함께 합쳐졌습니다.';
    });
  };

  const handleLeave = () => {
    if (!window.confirm('이 기기에서 동기화를 해제할까요? 기록은 코드에 남아 다른 기기에서 계속 볼 수 있습니다.')) return;
    run(async () => {
      await leaveSyncCode();
      return '이 기기의 동기화를 해제했습니다.';
    });
  };

  return (
    <div className="text-left bg-gray-50 border border-gray-200 rounded-xl p-4">
      <div className="flex items-center mb-2">
        <RefreshCw className="w-4 h-4 mr-1.5 text-black" />
        <span className="font-bold text-sm text-black">기기 간 기록 동기화</span>
      </div>

      {code ? (
        <div className="space-y-2">
          <p className="text-sm text-black">
            동기화 코드 <span className="font-mono font-extrabold text-xl tracking-widest bg-black text-white px-2 py-0.5 rounded">{code}</span>
          </p>
          <p className="text-xs text-gray-600">다른 기기에서 이 코드를 입력하면 같은 기록을 볼 수 있어요. 코드는 가족끼리만 공유하세요.</p>
          <button onClick={handleLeave} disabled={busy} className="text-xs font-bold text-gray-600 underline disabled:opacity-50">
            이 기기에서 동기화 해제
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-600">
            지금 기록은 이 기기에만 보입니다. 코드를 만들거나, 다른 기기에서 받은 코드를 입력하면 기록이 합쳐집니다.
          </p>
          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="0000"
              aria-label="동기화 코드 4자리"
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg font-mono text-lg tracking-widest text-center text-black"
            />
            <button type="submit" disabled={busy || input.length !== 4} className="flex-1 bg-black text-white text-sm font-bold rounded-lg px-3 py-2 disabled:opacity-50">
              코드 입력
            </button>
          </form>
          <button onClick={handleCreate} disabled={busy} className="w-full bg-white border border-black text-black text-sm font-bold rounded-lg px-3 py-2 disabled:opacity-50">
            새 동기화 코드 만들기
          </button>
        </div>
      )}

      {busy && <p className="mt-2 text-xs text-gray-600 flex items-center"><Loader2 className="w-3 h-3 mr-1 animate-spin" />처리 중...</p>}
      {message && <p className={`mt-2 text-xs font-bold ${message.error ? 'text-red-600' : 'text-emerald-700'}`}>{message.text}</p>}
    </div>
  );
};
