import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, downloadFile } from '../api.js';
import { useAuth } from '../auth.jsx';
import { typeLabel } from '../orgTypes.js';

const BILLING = { free: 'No plans yet', trial: 'Trial', active: 'Paid', grace: 'Payment due', overdue: 'Overdue' };
const date = (d) => (d ? new Date(d).toLocaleDateString('en-NG', { dateStyle: 'medium' }) : '—');

// For Frankiecode staff: every workplace that has signed up. Contact details and counts only, never attendance records.
export default function AdminWorkplaces() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      api(`/platform/workplaces${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`).then(setData).catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const rows = useMemo(() => {
    const r = [...(data?.rows || [])];
    if (sort === 'people') r.sort((a, b) => b.people - a.people);
    if (sort === 'active') r.sort((a, b) => new Date(b.lastActive || 0) - new Date(a.lastActive || 0));
    return r;
  }, [data, sort]);

  if (!user.isPlatformAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <h1>Workplaces</h1>
      <p className="muted">Every workplace that has signed up. Owner emails are not verified, so treat them as contact details, not proof of identity.</p>
      <div className="card row">
        <label style={{ flex: 2 }}>Search<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Workplace ID or owner email" /></label>
        <label>Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="active">Last activity</option>
            <option value="people">Most people</option>
          </select>
        </label>
        <button className="btn ghost" onClick={() => downloadFile(`/platform/workplaces.csv${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`, 'workplaces.csv')}>Download CSV</button>
      </div>
      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="center">Loading…</p>}
      {data && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <p className="muted">{data.total} {data.total === 1 ? 'workplace' : 'workplaces'}</p>
          {rows.length === 0 ? <p className="muted">No workplaces match.</p> : (
            <table>
              <thead><tr><th>Workplace</th><th>Type</th><th>Created</th><th>People</th><th>Last activity</th><th>Billing</th><th>Owner</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong><br /><small className="muted">{r.workplaceId}</small></td>
                    <td>{typeLabel(r.type)}</td>
                    <td>{date(r.createdAt)}</td>
                    <td>{r.people}</td>
                    <td>{date(r.lastActive)}</td>
                    <td>{BILLING[r.billing] || r.billing}</td>
                    <td>{r.ownerName}<br />{r.ownerEmail && <a href={`mailto:${r.ownerEmail}`}>{r.ownerEmail}</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
