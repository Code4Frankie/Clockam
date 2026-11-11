import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Logo from '../components/Logo.jsx';

export default function ForgotWorkplace() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setDone((await api('/auth/forgot-workplace', { method: 'POST', body: { email }, auth: false })).message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <Link to="/" className="back-home">← Back to home</Link>
        <Logo size={150} />
        <h2>Find your Workplace ID</h2>
        {done ? (
          <p role="status">{done}</p>
        ) : (
          <>
            <p className="muted">Enter the email you sign in with. We will email you the Workplace ID.</p>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Email me my Workplace ID'}</button>
          </>
        )}
        <p className="muted">You can also ask your owner or admin. It is at the bottom of their menu.</p>
        <p className="muted"><Link to="/login">Back to sign in</Link></p>
      </form>
    </div>
  );
}
