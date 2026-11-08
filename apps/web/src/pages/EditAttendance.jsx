import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const hhmm = (d, timeZone) => (d ? new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d)) : '');
const dateIn = (timeZone, d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const stamp = (d, tz) => (d ? `${dateIn(tz, new Date(d))} ${hhmm(d, tz)}` : '—');

export default function EditAttendance() {
  const { user, organization } = useAuth();
  const tz = organization?.timezone || 'Africa/Lagos';
  const [people, setPeople] = useState([]);
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(() => dateIn(tz));
  const [day, setDay] = useState(null);
  const [f, setF] = useState({ clockIn: '', clockOut: '', reason: '' });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/employees').then((l) => setPeople(l.filter((p) => p.active))).catch((e) => setMsg({ type: 'err', text: e.message })); }, []);

  const load = useCallback(async () => {
    if (!userId || !date) return setDay(null);
    try {
      const d = await api(`/attendance/day?userId=${userId}&date=${date}`);
      setDay(d);
      setF((cur) => ({ ...cur, clockIn: hhmm(d.record?.clockIn, tz), clockOut: hhmm(d.record?.clockOut, tz), reason: '' }));
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
  }, [userId, date, tz]);
  useEffect(() => { load(); }, [load]);

  if (!['owner', 'admin'].includes(user.role)) return <Navigate to="/dashboard" replace />;

  async function save(e) {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    setBusy(true);
    try {
      await api('/attendance/edit', { method: 'POST', body: { userId, date, clockIn: f.clockIn, clockOut: f.clockOut || null, reason: f.reason } });
      await load();
      setMsg({ type: 'ok', text: 'Saved. The change and your reason are kept in the history below.' });
    } catch (err) {
      const d = err.details && typeof err.details === 'object' && Object.values(err.details).flat()[0];
      setMsg({ type: 'err', text: d || err.message });
    } finally { setBusy(false); }
  }

  const rec = day?.record;
  return (
    <>
      <h1>Edit attendance</h1>
      <p className="muted">Add or change someone's clock-in and clock-out for a day, for example when they could not clock in because of the network. A reason is required, and every change is kept in the history.</p>

      <div className="card">
        <div className="grid2">
          <label>Employee
            <select value={userId} onChange={(e) => { setUserId(e.target.value); setMsg({ type: '', text: '' }); }}>
              <option value="">Choose an employee</option>
              {people.map((p) => <option key={p._id} value={p._id}>{p.name} ({p.staffId})</option>)}
            </select>
          </label>
          <label>Date<input type="date" value={date} max={dateIn(tz)} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
      </div>

      {day && (
        <form className="card" onSubmit={save}>
          <h2>{day.employee.name} · {date}</h2>
          <p className="muted">
            {rec
              ? `Recorded: ${rec.status}, ${rec.method === 'manual' ? 'entered by an admin' : `clocked with ${rec.method}`}${rec.clockOutMethod === 'auto' ? ', clock-out set automatically' : ''}. Breaks ${rec.breakMinutes || 0} min, worked ${((rec.minutesWorked || 0) / 60).toFixed(2)} h.`
              : 'No record for this day yet. Saving will create one.'}
          </p>
          <div className="grid2">
            <label>Clock-in time<input type="time" value={f.clockIn} onChange={(e) => setF({ ...f, clockIn: e.target.value })} required /></label>
            <label>Clock-out time (leave empty if still working)<input type="time" value={f.clockOut} onChange={(e) => setF({ ...f, clockOut: e.target.value })} /></label>
          </div>
          <label>Reason<input value={f.reason} maxLength={200} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Network was down at arrival" required /></label>
          <p className="muted">Late or on time is worked out from your work hours. Times are in {tz}.</p>
          {msg.text && <p role={msg.type === 'ok' ? 'status' : 'alert'} className={msg.type === 'ok' ? 'success' : 'error'}>{msg.text}</p>}
          <button className="btn" disabled={busy || !f.clockIn || f.reason.trim().length < 3}>{busy ? 'Saving…' : 'Save changes'}</button>

          {rec?.breaks?.length > 0 && (
            <>
              <h3>Breaks</h3>
              <ul>{rec.breaks.map((b, i) => <li key={i}>{hhmm(b.start, tz)} – {b.end ? hhmm(b.end, tz) : 'still on break'}</li>)}</ul>
            </>
          )}
          {rec?.edits?.length > 0 && (
            <>
              <h3>History</h3>
              <ul>
                {[...rec.edits].reverse().map((h, i) => (
                  <li key={i}>
                    {stamp(h.at, tz)}: {h.by} set {hhmm(h.after?.clockIn, tz)}–{hhmm(h.after?.clockOut, tz) || 'open'}
                    {h.before?.clockIn ? ` (was ${hhmm(h.before.clockIn, tz)}–${hhmm(h.before.clockOut, tz) || 'open'})` : ' (new record)'}. Reason: {h.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </form>
      )}
      {!day && msg.text && <p className="error">{msg.text}</p>}
    </>
  );
}
