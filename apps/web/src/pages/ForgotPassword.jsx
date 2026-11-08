import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Logo from '../components/Logo.jsx';

export default function ForgotPassword() {
  const [form, setForm] = useState({ orgSlug: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api('/auth/forgot-password', { method: 'POST', body: form, auth: false });
      setDone(r.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <Logo size={150} />
        <h2>Reset your password</h2>
        {done ? (
          <p role="status">{done}</p>
        ) : (
          <>
            <p className="muted">Enter your workplace ID and email. We will send you a link to choose a new password.</p>
            <label>Workplace ID<input value={form.orgSlug} onChange={set('orgSlug')} placeholder="e.g. frankiecode" required /></label>
            <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          </>
        )}
        <p className="muted"><Link to="/login">Back to sign in</Link></p>
      </form>
    </div>
  );
}
