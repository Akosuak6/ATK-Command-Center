'use client';

import { useState, type FormEvent } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) { setError('Type your password'); return; }
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) { setError(body.error || 'Could not sign in'); return; }
      location.replace('/');
    } catch {
      setError('No connection. Try again when you are online.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="card login-card" onSubmit={submit} noValidate>
        <div className="login-brand">
          <span className="brand-name">Akosua's</span>
          <span className="brand-script">command center</span>
        </div>
        <label htmlFor="pw" className="lbl">Password</label>
        <input id="pw" type="password" className="field" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="sub" role="alert">{error}</p>}
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Signing in' : 'Sign in'}</button>
        <p className="sub">Stays signed in on this device for a year.</p>
      </form>
    </main>
  );
}
