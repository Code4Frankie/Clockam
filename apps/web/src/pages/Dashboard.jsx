import { useEffect, useState } from 'react';
import { api, fmtTime } from '../api.js';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => api('/attendance/today').then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Loading…</p>;

  return (
    <>
      <h1>Today <small>{data.date}</small></h1>
      <div className="stats">
        <div className="stat"><b>{data.totalStaff}</b><span>Staff</span></div>
        <div className="stat ok"><b>{data.present}</b><span>Clocked in</span></div>
        <div className="stat warn"><b>{data.late}</b><span>Late</span></div>
        <div className="stat bad"><b>{data.absent}</b><span>Not in yet</span></div>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Staff ID</th><th>In</th><th>Out</th><th>Status</th><th>Method</th></tr></thead>
          <tbody>
            {data.records.map((r) => (
              <tr key={r._id}>
                <td>{r.user?.name}</td><td>{r.user?.staffId}</td>
                <td>{fmtTime(r.clockIn)}</td><td>{fmtTime(r.clockOut)}</td>
                <td><span className={`pill ${r.status}`}>{r.status}</span></td><td>{r.method}</td>
              </tr>
            ))}
            {!data.records.length && <tr><td colSpan="6" className="muted">Nobody has clocked in yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
