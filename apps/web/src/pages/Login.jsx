import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Logo from '../components/Logo.jsx';

export default function Login() {
  const [form, setForm] = useState({ orgSlug: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      signIn(await api('/auth/login', { method: 'POST', body: form, auth: false }));
      navigate('/dashboard');
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
        <h2>Sign in</h2>
        <label>Workplace ID<input value={form.orgSlug} onChange={set('orgSlug')} placeholder="e.g. frankiecode" required /></label>
        <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>
        <label>Password<input type="password" value={form.password} onChange={set('password')} required /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted">New workplace? <Link to="/register">Create one</Link></p>
      </form>
    </div>
  );
}
