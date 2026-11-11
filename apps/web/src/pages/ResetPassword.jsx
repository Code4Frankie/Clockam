import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import Logo from '../components/Logo.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api('/auth/reset-password', { method: 'POST', body: { token, password }, auth: false });
      setDone(r.message);
    } catch (err) {
      const d = err.details && typeof err.details === 'object' && Object.values(err.details).flat()[0];
      setError(d || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <Link to="/" className="back-home">← Back to home</Link>
        <Logo size={150} />
        <h2>Choose a new password</h2>
        {!token ? (
          <p className="error">This link is missing its code. Open the link from your email again, or ask for a new one.</p>
        ) : done ? (
          <p role="status">{done}</p>
        ) : (
          <>
            <label>New password (8+ characters)<PasswordInput minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
          </>
        )}
        <p className="muted">{done ? <Link to="/login">Sign in</Link> : <Link to="/forgot-password">Ask for a new link</Link>}</p>
      </form>
    </div>
  );
}
