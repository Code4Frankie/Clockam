import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { startRegistration } from '@simplewebauthn/browser';
import { api } from '../api.js';
import Logo from '../components/Logo.jsx';
import InstallButton from '../components/InstallButton.jsx';

// One-time phone set-up for students: matric number + the code the school gave them, then the phone's own face/fingerprint prompt.
export default function Enrol() {
  const [params] = useSearchParams();
  const [orgSlug, setOrgSlug] = useState(params.get('org') || '');
  const [matric, setMatric] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = { orgSlug: orgSlug.trim(), matric: matric.trim(), code: code.trim() };
      const options = await api('/school/enrol/options', { method: 'POST', auth: false, body });
      const response = await startRegistration({ optionsJSON: options });
      setDone(await api('/school/enrol/verify', { method: 'POST', auth: false, body: { ...body, response, deviceName: 'Phone' } }));
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'The face or fingerprint prompt was cancelled. Try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="auth-page"><div className="card auth-card center-text">
        <Logo size={110} />
        <h2>Phone set up</h2>
        <p>{done.name}, you can now mark attendance in class by scanning the code on the screen.</p>
        <p className="muted">Your set-up code has been used. Use the same phone each time.</p>
      </div></div>
    );
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <Logo size={110} />
        <h2>Set up your phone</h2>
        <p className="muted">Do this once, on the phone you will use in class. You need the set-up code your school gave you.</p>
        {!params.get('org') && <label>School code<input value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} autoCapitalize="none" required /></label>}
        <label>Matric number<input value={matric} onChange={(e) => setMatric(e.target.value)} autoCapitalize="characters" autoComplete="off" required /></label>
        <label>Set-up code<input value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" autoComplete="off" placeholder="ABCD-EFGH" required /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn big" disabled={busy}>{busy ? 'Setting up…' : 'Set up with face or fingerprint'}</button>
        <p className="muted">Your phone keeps your face or fingerprint. ClockAm only stores a key that proves it was your phone. Use a phone with face unlock turned on if you want a face check.</p>
        <InstallButton />
        <p className="muted"><Link to="/">Back to ClockAm</Link></p>
      </form>
    </div>
  );
}
