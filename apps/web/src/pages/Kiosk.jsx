import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import { api, fmtTime } from '../api.js';
import Logo from '../components/Logo.jsx';

const CFG_KEY = 'clockam.kiosk';
const loadCfg = () => {
  try { return { bridgeUrl: 'http://127.0.0.1:8123', deviceId: '', deviceKey: '', ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') }; }
  catch { return { bridgeUrl: 'http://127.0.0.1:8123', deviceId: '', deviceKey: '' }; }
};

const getLocation = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(undefined),
      { timeout: 4000 }
    );
  });

export default function Kiosk() {
  const { orgSlug } = useParams();
  const [mode, setMode] = useState('device'); // 'device' = phone/Windows Hello/FIDO key, 'scanner' = USB/handheld scanner
  const [now, setNow] = useState(new Date());
  const [staffId, setStaffId] = useState('');
  const [manualId, setManualId] = useState('');
  const [cfg, setCfg] = useState(loadCfg);
  const [showCfg, setShowCfg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 6000);
    return () => clearTimeout(t);
  }, [result]);

  const saveCfg = (next) => {
    setCfg(next);
    localStorage.setItem(CFG_KEY, JSON.stringify(next));
  };

  const show = (res) =>
    setResult({
      ok: true,
      title: res.action === 'clock-in' ? 'Clocked in' : 'Clocked out',
      text: `${res.employee.name} · ${fmtTime(res.action === 'clock-in' ? res.record.clockIn : res.record.clockOut)}`,
      late: res.record.status === 'late' && res.action === 'clock-in',
    });

  async function clockWithDevice(e) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const body = { orgSlug, staffId: staffId.trim() };
      const optionsJSON = await api('/biometric/webauthn/login/options', { method: 'POST', body, auth: false });
      const response = await startAuthentication({ optionsJSON });
      const location = await getLocation();
      show(await api('/biometric/webauthn/login/verify', { method: 'POST', body: { ...body, response, location }, auth: false }));
      setStaffId('');
    } catch (err) {
      setResult({ ok: false, title: 'Could not clock', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function clockWithScanner(testId) {
    setBusy(true);
    setResult(null);
    try {
      let scannerUserId = testId;
      if (!scannerUserId) {
        // The local scanner bridge captures + matches the finger and returns the scanner's user ID.
        const r = await fetch(`${cfg.bridgeUrl}/identify`, { method: 'POST' }).catch(() => null);
        if (!r || !r.ok) throw new Error('Scanner bridge not reachable. Is the scanner service running on this PC?');
        scannerUserId = String((await r.json()).scannerUserId ?? '');
        if (!scannerUserId) throw new Error('Finger not recognised. Try again.');
      }
      show(
        await api('/biometric/scanner/clock', {
          method: 'POST',
          auth: false,
          headers: { 'x-device-id': cfg.deviceId, 'x-device-key': cfg.deviceKey },
          body: { scannerUserId },
        })
      );
      setManualId('');
    } catch (err) {
      setResult({ ok: false, title: 'Could not clock', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kiosk">
      <Logo size={130} />
      <div className="kiosk-clock">{now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
      <div className="kiosk-date">{now.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>

      <div className="tabs">
        <button className={mode === 'device' ? 'active' : ''} onClick={() => setMode('device')}>Phone / PC fingerprint</button>
        <button className={mode === 'scanner' ? 'active' : ''} onClick={() => setMode('scanner')}>USB / handheld scanner</button>
      </div>

      <div className="card kiosk-card">
        {mode === 'device' ? (
          <form onSubmit={clockWithDevice}>
            <label>Staff ID<input autoFocus value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="Enter your Staff ID" required /></label>
            <button className="btn big" disabled={busy}>{busy ? 'Touch the fingerprint sensor…' : 'Clock in / out'}</button>
          </form>
        ) : (
          <>
            <button className="btn big" disabled={busy || !cfg.deviceId} onClick={() => clockWithScanner()}>
              {busy ? 'Place finger on scanner…' : 'Scan fingerprint'}
            </button>
            {!cfg.deviceId && <p className="muted">Open “Scanner settings” and enter this kiosk’s device ID and key first.</p>}
            <button className="link" onClick={() => setShowCfg(!showCfg)}>Scanner settings</button>
            {showCfg && (
              <div className="cfg">
                <label>Scanner bridge URL<input value={cfg.bridgeUrl} onChange={(e) => saveCfg({ ...cfg, bridgeUrl: e.target.value })} /></label>
                <label>Device ID<input value={cfg.deviceId} onChange={(e) => saveCfg({ ...cfg, deviceId: e.target.value.trim() })} /></label>
                <label>Device API key<input type="password" value={cfg.deviceKey} onChange={(e) => saveCfg({ ...cfg, deviceKey: e.target.value.trim() })} /></label>
                <label>Test without hardware (scanner user ID)
                  <span className="row">
                    <input value={manualId} onChange={(e) => setManualId(e.target.value)} placeholder="e.g. 12" />
                    <button className="btn small" type="button" disabled={!manualId || busy} onClick={() => clockWithScanner(manualId)}>Simulate</button>
                  </span>
                </label>
              </div>
            )}
          </>
        )}
      </div>

      {result && (
        <div className={`kiosk-result ${result.ok ? (result.late ? 'late' : 'ok') : 'bad'}`}>
          <h2>{result.title}{result.late ? ' (late)' : ''}</h2>
          <p>{result.text}</p>
        </div>
      )}
    </div>
  );
}
