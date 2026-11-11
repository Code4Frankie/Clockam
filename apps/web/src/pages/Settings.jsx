import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ORG_TYPES } from '../orgTypes.js';

const ZONES = ['Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'Africa/Johannesburg', 'Africa/Cairo', 'Europe/London', 'UTC'];

const fromOrg = (o) => ({
  type: o.type || 'workplace',
  requireSelfie: o.requireSelfie !== false,
  timezone: o.timezone || 'Africa/Lagos',
  workStart: o.workStart || '08:00',
  workEnd: o.workEnd || '17:00',
  graceMinutes: String(o.graceMinutes ?? 15),
  autoHours: String(o.autoClockOutHours ?? 0),
  networks: (o.allowedNetworks || []).join('\n'),
  geoEnabled: !!o.geofence?.enabled,
  lat: o.geofence?.lat != null ? String(o.geofence.lat) : '',
  lng: o.geofence?.lng != null ? String(o.geofence.lng) : '',
  radius: String(o.geofence?.radiusMeters ?? 150),
});

export default function Settings() {
  const { user, organization, refresh } = useAuth();
  const [f, setF] = useState(() => fromOrg(organization || {}));
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (organization) setF(fromOrg(organization)); }, [organization]);

  if (!['owner', 'admin'].includes(user.role)) return <Navigate to="/dashboard" replace />;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function useMyLocation() {
    setMsg({ type: '', text: '' });
    if (!navigator.geolocation) return setMsg({ type: 'err', text: 'This browser cannot share its location.' });
    navigator.geolocation.getCurrentPosition(
      (p) => setF((cur) => ({ ...cur, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })),
      () => setMsg({ type: 'err', text: 'Location was blocked. Allow location for this site, or type the coordinates in.' }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function addMyNetwork() {
    setMsg({ type: '', text: '' });
    try {
      const { ip } = await api('/organization/my-ip');
      setF((cur) => (cur.networks.split('\n').map((s) => s.trim()).includes(ip) ? cur : { ...cur, networks: [cur.networks.trim(), ip].filter(Boolean).join('\n') }));
      setMsg({ type: 'ok', text: `Added ${ip}. Check it matches your public IP address (search "what is my IP"), then save.` });
    } catch (err) { setMsg({ type: 'err', text: err.message }); }
  }

  async function save(e) {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    setBusy(true);
    try {
      const geofence = { enabled: f.geoEnabled, radiusMeters: Number(f.radius) };
      if (f.lat !== '' && f.lng !== '') { geofence.lat = Number(f.lat); geofence.lng = Number(f.lng); }
      await api('/organization/settings', {
        method: 'PATCH',
        body: { type: f.type, requireSelfie: f.requireSelfie, timezone: f.timezone, workStart: f.workStart, workEnd: f.workEnd, graceMinutes: Number(f.graceMinutes), autoClockOutHours: Number(f.autoHours), allowedNetworks: f.networks.split('\n').map((s) => s.trim()).filter(Boolean), geofence },
      });
      await refresh();
      setMsg({ type: 'ok', text: 'Saved. The new rules apply to clock-ins from now on. Past records are not changed.' });
    } catch (err) {
      const d = err.details && typeof err.details === 'object' && Object.values(err.details).flat()[0];
      setMsg({ type: 'err', text: d || err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Work hours &amp; location</h1>
      <p className="muted">These rules decide who is marked late and where staff can clock in from.</p>

      <form className="card" onSubmit={save}>
        <h2>Type</h2>
        <label>This ClockAm is for a
          <select value={f.type} onChange={set('type')}>
            {ORG_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        {f.type === 'school' && (
          <>
            <label className="check"><input type="checkbox" checked={f.requireSelfie} onChange={set('requireSelfie')} /> Students take a selfie when marking attendance (the lecturer can view it for 30 days)</label>
            {!f.geoEnabled && !f.networks.trim() && (
              <p className="warn"><strong>No campus rule set.</strong> Without a campus location or Wi-Fi rule below, a student could mark attendance from outside the classroom if a friend sends them the code. Turn on the location check, add the campus Wi-Fi, or both.</p>
            )}
          </>
        )}
        <h2>Work hours</h2>
        <div className="grid2">
          <label>Start time<input type="time" value={f.workStart} onChange={set('workStart')} required /></label>
          <label>Closing time<input type="time" value={f.workEnd} onChange={set('workEnd')} required /></label>
          <label>Grace period (minutes)<input type="number" min="0" max="180" value={f.graceMinutes} onChange={set('graceMinutes')} required /></label>
          <label>Time zone
            <select value={f.timezone} onChange={set('timezone')}>
              {[...new Set([f.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}
            </select>
          </label>
        </div>
        <label>Close days people forgot to clock out
          <select value={f.autoHours} onChange={set('autoHours')}>
            <option value="0">Off</option>
            {[1, 2, 3, 4, 6, 8, 12].map((h) => <option key={h} value={h}>{h} hour{h === 1 ? '' : 's'} after closing time</option>)}
          </select>
        </label>
        <p className="muted">
          Someone who clocks in after the start time plus the grace period is marked late. If automatic closing is on, a day still open
          after that wait is closed at the closing time and marked automatic. You can correct it on the Edit attendance page.
        </p>

        <h2>Location check</h2>
        <label className="check">
          <input type="checkbox" checked={f.geoEnabled} onChange={set('geoEnabled')} />
          Only allow clock-in from phones and laptops near the workplace
        </label>
        <div className="grid2">
          <label>Latitude<input inputMode="decimal" value={f.lat} onChange={set('lat')} placeholder="6.524400" /></label>
          <label>Longitude<input inputMode="decimal" value={f.lng} onChange={set('lng')} placeholder="3.379200" /></label>
          <label>Allowed distance (metres)<input type="number" min="20" max="5000" value={f.radius} onChange={set('radius')} /></label>
        </div>
        <button type="button" className="btn ghost" onClick={useMyLocation}>Use my current location</button>
        <p className="muted">
          Stand at the workplace when you use this. Staff will be asked to share their location when they clock in. USB and handheld
          scanners are not checked, because they stay at the workplace.
        </p>

        <h2>Allowed networks</h2>
        <label>Only allow phones and laptops on these networks to clock in (one per line, leave empty for no rule)
          <textarea rows={3} value={f.networks} onChange={set('networks')} placeholder={'41.58.10.7\n41.58.20.0/24'} />
        </label>
        <button type="button" className="btn ghost" onClick={addMyNetwork}>Add the network I am on now</button>
        <p className="muted">
          Use the workplace's public internet address. Do this while connected to the workplace Wi-Fi. Staff on mobile data will be refused,
          and if your internet provider changes the address you must update it here. USB scanners and ZKTeco units are never checked.
        </p>

        {msg.text && <p role="status" className={msg.type === 'ok' ? 'success' : 'error'}>{msg.text}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
      </form>
    </>
  );
}
