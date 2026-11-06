import { useState } from 'react';
import { api, downloadFile } from '../api.js';

const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();

export default function Reports() {
  const [from, setFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(iso(today));
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  async function run(e) {
    e.preventDefault();
    setError('');
    try { setRows(await api(`/reports/summary?from=${from}&to=${to}`)); } catch (err) { setError(err.message); }
  }

  return (
    <>
      <h1>Reports</h1>
      <form className="card row" onSubmit={run}>
        <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="btn">Run</button>
        <button type="button" className="btn ghost" onClick={() => downloadFile(`/reports/export.csv?from=${from}&to=${to}`, `clockam-${from}_to_${to}.csv`)}>
          Download CSV
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {rows && (
        <div className="card">
          <table>
            <thead><tr><th>Name</th><th>Staff ID</th><th>Dept</th><th>Days present</th><th>Days late</th><th>Hours</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId}><td>{r.name}</td><td>{r.staffId}</td><td>{r.department || '—'}</td><td>{r.daysPresent}</td><td>{r.daysLate}</td><td>{r.hoursWorked}</td></tr>
              ))}
              {!rows.length && <tr><td colSpan="6" className="muted">No records in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
