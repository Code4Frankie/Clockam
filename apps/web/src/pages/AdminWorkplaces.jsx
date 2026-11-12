import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, downloadFile } from '../api.js';
import { useAuth } from '../auth.jsx';
import { typeLabel } from '../orgTypes.js';

const day = (d) => (d ? new Date(d).toLocaleDateString('en-NG', { dateStyle: 'medium' }) : '—');
const dayTime = (d) => new Date(d).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

// What package a workplace is on, in words.
function packageText(p) {
  const tier = p.tierName ? `${p.tierName}, ` : '';
  if (p.status === 'exempt') return 'Billing waived';
  if (p.status === 'trial') return `Free trial (${p.trialDays} days), ${p.daysLeft} ${p.daysLeft === 1 ? 'day' : 'days'} left`;
  if (p.status === 'active') return `${tier}paid until ${day(p.until)}`;
  if (p.status === 'grace') return `${tier}payment due`;
  if (p.status === 'overdue') return `${tier}overdue`;
  return 'No plans set up yet';
}

// For Frankiecode staff: every workplace that has signed up, once, with how it is growing and which package it is on.
// Contact details and counts only, never attendance records. Prices and trial length are changed under Packages.
export default function AdminWorkplaces() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => api(`/platform/workplaces${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`).then(setData).catch((e) => setError(e.message)), [q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const rows = useMemo(() => {
    const r = [...(data?.rows || [])];
    if (sort === 'people') r.sort((a, b) => b.staff + b.students - (a.staff + a.students));
    if (sort === 'active') r.sort((a, b) => new Date(b.lastActive || 0) - new Date(a.lastActive || 0));
    return r;
  }, [data, sort]);

  if (!user.isPlatformAdmin) return <Navigate to="/dashboard" replace />;

  async function suspend(r) {
    const reason = window.prompt(`Suspend ${r.name}? People there will not be able to sign in or clock in until you reinstate it.\n\nReason (kept on record):`);
    if (!reason || reason.trim().length < 3) return;
    setError(''); setMsg('');
    try { await api(`/platform/workplaces/${r.id}/suspend`, { method: 'POST', body: { reason: reason.trim() } }); setMsg(`${r.name} is suspended.`); load(); } catch (e) { setError(e.message); }
  }
  async function reinstate(r) {
    if (!window.confirm(`Reinstate ${r.name}? Their people can sign in and clock in again.`)) return;
    setError(''); setMsg('');
    try { await api(`/platform/workplaces/${r.id}/reinstate`, { method: 'POST' }); setMsg(`${r.name} is reinstated.`); load(); } catch (e) { setError(e.message); }
  }

  return (
    <>
      <h1>Workplaces</h1>
      <p className="muted">Every workplace that has signed up, listed once. Owner emails are not verified, so treat them as contact details, not proof of identity.</p>
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
      {msg && <p className="success">{msg}</p>}
      {!data && !error && <p className="center">Loading…</p>}
      {data && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <p className="muted">{data.total} {data.total === 1 ? 'workplace' : 'workplaces'}</p>
          {rows.length === 0 ? <p className="muted">No workplaces match.</p> : (
            <table>
              <thead><tr><th>Workplace</th><th>Created</th><th>People</th><th>Package</th><th>Last activity</th><th>Owner</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={r.suspended ? { opacity: 0.75 } : undefined}>
                    <td><strong>{r.name}</strong><br /><small className="muted">{r.workplaceId} · {typeLabel(r.type)}</small></td>
                    <td>{dayTime(r.createdAt)}</td>
                    <td>{r.staff} staff{r.type === 'school' || r.students > 0 ? <><br />{r.students} students</> : null}</td>
                    <td>{packageText(r.package)}<br /><Link to={`/admin/workplaces/${r.id}`}>Billing</Link></td>
                    <td>{day(r.lastActive)}</td>
                    <td>{r.ownerName}<br />{r.ownerEmail && <a href={`mailto:${r.ownerEmail}`}>{r.ownerEmail}</a>}</td>
                    <td>
                      {r.suspended ? (
                        <>
                          <strong className="error">Suspended</strong><br />
                          <small className="muted">{day(r.suspendedAt)}: {r.suspendedReason}</small><br />
                          <button className="btn small ghost" onClick={() => reinstate(r)}>Reinstate</button>
                        </>
                      ) : (
                        <>Active<br /><button className="btn small ghost" onClick={() => suspend(r)}>Suspend</button></>
                      )}
                    </td>
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
