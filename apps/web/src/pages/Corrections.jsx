import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const hhmm = (d, timeZone) => (d ? new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d)) : '');

export default function Corrections() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [times, setTimes] = useState({});
  const [state, setState] = useState({}); // per row: { busy, error }
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api('/attendance/missing-clockouts')
      .then((d) => {
        setData(d);
        setTimes(Object.fromEntries(d.rows.map((r) => [`${r.userId}|${r.date}`, hhmm(r.suggestedClockOut, d.timezone)])));
      })
      .catch((e) => setLoadError(e.message));
  }, []);

  if (!['owner', 'admin'].includes(user.role)) return <Navigate to="/dashboard" replace />;

  async function save(r) {
    const key = `${r.userId}|${r.date}`;
    setState((s) => ({ ...s, [key]: { busy: true } }));
    try {
      await api('/attendance/fix-clockout', { method: 'POST', body: { userId: r.userId, date: r.date, time: times[key] } });
      setData((d) => ({ ...d, rows: d.rows.filter((x) => `${x.userId}|${x.date}` !== key) }));
    } catch (e) {
      const d = e.details && typeof e.details === 'object' && Object.values(e.details).flat()[0];
      setState((s) => ({ ...s, [key]: { error: d || e.message } }));
    }
  }

  return (
    <>
      <h1>Missed clock-outs</h1>
      <p className="muted">People who clocked in on an earlier day and never clocked out. Check the time, then save it as their clock-out.</p>
      {loadError && <p className="error">{loadError}</p>}
      {!data && !loadError && <p className="muted">Loading…</p>}
      {data && data.rows.length === 0 && <div className="card"><p>No missed clock-outs. Everyone who clocked in has clocked out.</p></div>}
      {data && data.rows.length > 0 && (
        <div className="card">
          <table>
            <thead><tr><th>Employee</th><th>Date</th><th>Clocked in</th><th>Clock-out time</th><th /></tr></thead>
            <tbody>
              {data.rows.map((r) => {
                const key = `${r.userId}|${r.date}`;
                const st = state[key] || {};
                return (
                  <tr key={key}>
                    <td>{r.name} <span className="muted">({r.staffId})</span></td>
                    <td>{r.date}</td>
                    <td>{hhmm(r.clockIn, data.timezone)}</td>
                    <td>
                      <input type="time" value={times[key] || ''} onChange={(e) => setTimes({ ...times, [key]: e.target.value })} aria-label={`Clock-out time for ${r.name} on ${r.date}`} />
                      {st.error && <div className="error" role="alert">{st.error}</div>}
                    </td>
                    <td><button className="btn" disabled={st.busy || !times[key]} onClick={() => save(r)}>{st.busy ? 'Saving…' : 'Save clock-out'}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted">The suggested time is the workplace closing time. Past records you save here are marked as set by you.</p>
        </div>
      )}
    </>
  );
}
