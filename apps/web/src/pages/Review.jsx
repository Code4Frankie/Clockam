import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const dateIn = (timeZone, d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const hhmm = (d, timeZone) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));
const WHY = { 'near-limit': 'Clocked in close to the edge of the allowed distance' };

export default function Review() {
  const { organization } = useAuth();
  const tz = organization?.timezone || 'Africa/Lagos';
  const [to, setTo] = useState(() => dateIn(tz));
  const [from, setFrom] = useState(() => dateIn(tz, new Date(Date.now() - 14 * 86400000)));
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(null);
    api(`/attendance/flagged?from=${from}&to=${to}`).then(setRows).catch((e) => setError(e.message));
  }, [from, to]);

  return (
    <>
      <h1>To review</h1>
      <p className="muted">Clock-ins from phones and laptops that were accepted but sat close to the edge of the allowed distance. Worth a quick look if you suspect someone clocked in from outside.</p>
      <div className="card">
        <div className="grid2">
          <label>From<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {rows && rows.length === 0 && <div className="card"><p>Nothing to review in this period.</p></div>}
      {rows && rows.length > 0 && (
        <div className="card">
          <table>
            <thead><tr><th>Employee</th><th>Date</th><th>Clocked in</th><th>Why it is here</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td>{r.user?.name} <span className="muted">({r.user?.staffId})</span></td>
                  <td>{r.date}</td>
                  <td>{hhmm(r.clockIn, tz)}</td>
                  <td>{r.flags.map((f) => WHY[f] || f).join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
