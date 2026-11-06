import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function MyFingerprint() {
  const { user, refresh } = useAuth();
  const [deviceName, setDeviceName] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function enrol() {
    setBusy(true);
    setMsg(null);
    try {
      const optionsJSON = await api('/biometric/webauthn/register/options', { method: 'POST' });
      const response = await startRegistration({ optionsJSON });
      await api('/biometric/webauthn/register/verify', { method: 'POST', body: { response, deviceName: deviceName || 'This device' } });
      await refresh();
      setMsg({ ok: true, text: 'Fingerprint enrolled. You can now clock in at a kiosk with your Staff ID.' });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>My fingerprint</h1>
      <div className="card">
        <p>
          Staff ID: <b>{user.staffId}</b> · Status:{' '}
          <span className={`pill ${user.hasFingerprint ? 'present' : 'late'}`}>{user.hasFingerprint ? 'Enrolled' : 'Not enrolled'}</span>
        </p>
        <p className="muted">
          Enrol on the device you will clock in with: a laptop with Windows Hello, a phone with a fingerprint sensor, or a USB
          FIDO2 fingerprint key. Your fingerprint never leaves the device; ClockAm only stores a public key.
        </p>
        <div className="row">
          <input placeholder="Device name (e.g. My Tecno phone)" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
          <button className="btn" onClick={enrol} disabled={busy}>{busy ? 'Waiting for fingerprint…' : 'Enrol fingerprint'}</button>
        </div>
        {msg && <p className={msg.ok ? 'success' : 'error'}>{msg.text}</p>}
      </div>
    </>
  );
}
