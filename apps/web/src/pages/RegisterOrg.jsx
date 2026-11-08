import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Logo from '../components/Logo.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

export default function RegisterOrg() {
  const [form, setForm] = useState({ organizationName: '', name: '', email: '', password: '', timezone: 'Africa/Lagos' });
  const [error, setError] = useState('');
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      signIn(await api('/auth/register-org', { method: 'POST', body: form, auth: false }));
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <Logo size={150} />
        <h2>Create your workplace</h2>
        <label>Workplace name<input value={form.organizationName} onChange={set('organizationName')} required /></label>
        <label>Your name<input value={form.name} onChange={set('name')} required /></label>
        <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>
        <label>Password (8+ characters)<PasswordInput minLength={8} value={form.password} onChange={set('password')} required /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn">Create workplace</button>
        <p className="muted">Already registered? <Link to="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
