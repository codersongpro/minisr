import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { adminSyncLogin } from '../services/syncService';

interface AdminSyncFormProps {
  onSuccess: () => void;
}

// 관리자 전용: 관리자 비밀번호와 4자리 동기화 코드를 함께 입력한다.
export const AdminSyncForm: React.FC<AdminSyncFormProps> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{4}$/.test(code)) {
      setError('동기화 코드는 숫자 4자리입니다.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await adminSyncLogin(password, code);
      setPassword('');
      onSuccess();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '관리자 로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        placeholder="관리자 비밀번호"
        aria-label="관리자 비밀번호"
        className="w-full px-4 py-3 border border-gray-300 rounded-xl text-black"
        required
      />
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
        inputMode="numeric"
        autoComplete="off"
        placeholder="동기화 코드 4자리"
        aria-label="동기화 코드 4자리"
        className="w-full px-4 py-3 border border-gray-300 rounded-xl font-mono tracking-widest text-black"
        required
      />
      <p className="text-xs text-gray-600">
        같은 코드로 로그인한 기기끼리 기록이 합쳐집니다. 이 기기에서 이전에 풀었던 기록도 함께 옮겨집니다. 처음 쓰는 코드는 새로 만들어집니다.
      </p>
      {error && <p className="text-sm font-bold text-red-600">{error}</p>}
      <button type="submit" disabled={busy || !password || code.length !== 4} className="w-full bg-black text-white font-bold py-3 rounded-xl disabled:opacity-50 flex items-center justify-center">
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        관리자 로그인
      </button>
    </form>
  );
};
