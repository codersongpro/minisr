import React, { useEffect, useState } from 'react';

interface PasswordGateProps {
  children: React.ReactNode;
}

export const PasswordGate: React.FC<PasswordGateProps> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth', { credentials: 'include' })
      .then((response) => response.json())
      .then((data) => setAuthenticated(data.authenticated === true))
      .catch(() => setAuthenticated(false));
  }, []);

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || !password) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '잠금을 해제할 수 없습니다.');
      setAuthenticated(true);
      setPassword('');
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : '잠금을 해제할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (authenticated === null) return <div className="min-h-screen bg-gray-50" />;
  if (authenticated) return <>{children}</>;

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <form onSubmit={unlock} className="bg-white border border-gray-200 rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Mini SR Test</h1>
        <p className="text-sm text-gray-600 mb-6">앱을 사용하려면 비밀번호를 입력하세요.</p>
        <label htmlFor="app-password" className="sr-only">비밀번호</label>
        <input
          id="app-password"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-center tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-black"
          placeholder="비밀번호"
          required
        />
        {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}
        <button type="submit" disabled={loading} className="w-full mt-5 bg-black text-white rounded-xl py-3 font-bold disabled:opacity-60">
          {loading ? '확인 중...' : '입장하기'}
        </button>
      </form>
    </main>
  );
};
