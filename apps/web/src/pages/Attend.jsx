import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import { api } from '../api.js';
import Logo from '../components/Logo.jsx';
import InstallButton from '../components/InstallButton.jsx';
import { photoToJpeg } from '../selfie.js';

const MATRIC_KEY = 'clockam.matric';
const remembered = () => { try { return localStorage.getItem(MATRIC_KEY) || ''; } catch { return ''; } };

const getLocation = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(undefined), { timeout: 5000 });
  });

// Students open this by scanning the QR code in class. They confirm with the face or fingerprint check built into their phone.
export default function Attend() {
  const { sessionId } = useParams();
  const [params] = useSearchParams();
  const [info, setInfo] = useState(null);
  const [matric, setMatric] = useState(remembered);
  const [code, setCode] = useState(params.get('c') || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [selfie, setSelfie] = useState('');
  const needSelfie = info?.requireSelfie !== false;

  async function onPhoto(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { setSelfie(await photoToJpeg(f)); setError(''); } catch (err) { setError(err.message); }
  }

  useEffect(() => {
    api(`/school/public/session/${sessionId}`, { auth: false }).then(setInfo).catch((e) => setError(e.message));
  }, [sessionId]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (needSelfie && !selfie) return setError('Take a selfie first.');
    setBusy(true);
    try {
      const body = { sessionId, matric: matric.trim(), code: code.trim() };
      const options = await api('/school/attend/options', { method: 'POST', auth: false, body });
      const response = await startAuthentication({ optionsJSON: options });
      const location = await getLocation();
      const res = await api('/school/attend/verify', { method: 'POST', auth: false, body: { ...body, response, ...(location ? { location } : {}), ...(needSelfie ? { selfie } : {}) } });
      try { localStorage.setItem(MATRIC_KEY, matric.trim()); } catch { /* private mode */ }
      setDone(res);
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'The face or fingerprint check was cancelled. Try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="auth-page"><div className="card auth-card center-text">
        <Logo size={110} />
        <h2>{done.alreadyRecorded ? 'Already marked present' : 'You are marked present'}</h2>
        <p><strong>{done.name}</strong><br />{done.matric}</p>
        <p className="muted">{done.title}</p>
      </div></div>
    );
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <Logo size={110} />
        <h2>{info ? info.title : 'Mark attendance'}</h2>
        {info && <p className="muted">{info.school}</p>}
        {info && !info.live && <p className="error">This class has ended.</p>}
        <label>Matric number<input value={matric} onChange={(e) => setMatric(e.target.value)} autoCapitalize="characters" autoComplete="off" required /></label>
        <label>Code on the screen<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 digits" required /></label>
        {needSelfie && (
          <div>
            {selfie && <img className="selfie-prev" src={selfie} alt="Your selfie" />}
            <label className="btn ghost big" style={{ textAlign: 'center', cursor: 'pointer' }}>
              {selfie ? 'Retake selfie' : 'Take a selfie'}
              <input type="file" accept="image/*" capture="user" onChange={onPhoto} hidden />
            </label>
            <p className="muted">Your lecturer can see this photo for 30 days. It is then deleted.</p>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn big" disabled={busy || (info && !info.live)}>{busy ? 'Checking…' : 'Confirm with face or fingerprint'}</button>
        <p className="muted">Your phone does the face or fingerprint check. ClockAm never sees or stores your face.</p>
        <InstallButton />
        {info && <p className="muted">First time? <Link to={`/enrol?org=${info.orgSlug}`}>Set up your phone</Link></p>}
      </form>
    </div>
  );
}
