import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const when = (d) => (d ? new Date(d).toLocaleString() : '—');
const Sev = ({ s }) => <span className={`pill ${s}`}>{s}</span>;

export default function AdminSeo() {
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState('');

  const load = () => {
    api('/admin/seo/report').then(setReport).catch((e) => setError(e.message));
    api('/admin/seo/suggestions').then(setSuggestions).catch(() => {});
  };
  useEffect(() => {
    if (user.isPlatformAdmin) load();
  }, [user.isPlatformAdmin]);

  if (!user.isPlatformAdmin) return <Navigate to="/" replace />;

  async function decide(id, status) {
    setError('');
    try {
      await api(`/admin/seo/suggestions/${id}`, { method: 'POST', body: { status } });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <>
      <h1>Site audit</h1>
      <p className="muted">
        Results of the weekly crawl of the live site and deployment checks. Run one now with <code>npm run seo:crawl</code>.
      </p>
      {error && <p className="error">{error}</p>}
      {!report && !error && <p>Loading…</p>}
      {report?.empty && <div className="card"><p>{report.message}</p></div>}

      {report && !report.empty && (
        <>
          <p className="muted">Run {when(report.checkedAt)}</p>
          <div className="stats">
            <div className="stat"><b>{report.summary.pages}</b><span>Pages and checks</span></div>
            <div className="stat bad"><b>{report.summary.high}</b><span>High</span></div>
            <div className="stat warn"><b>{report.summary.medium}</b><span>Medium</span></div>
            <div className="stat"><b>{report.summary.low}</b><span>Low</span></div>
          </div>

          <h2>Changes since the previous run</h2>
          <div className="card">
            {report.regressions.length === 0 && report.resolved.length === 0 && <p className="muted">No changes, or this is the first run.</p>}
            {report.regressions.map((r) => (
              <p key={`${r.url}|${r.code}`}><Sev s={r.severity} /> <b>New:</b> {r.code} <span className="muted">on {r.url}</span></p>
            ))}
            {report.resolved.map((r) => (
              <p key={`${r.url}|${r.code}|ok`} className="success">Fixed: {r.code} <span className="muted">on {r.url}</span></p>
            ))}
          </div>

          {report.groups.map((g) => (
            <div key={g.pageType}>
              <h2>{g.pageType} <small className="muted">({g.pages})</small></h2>
              <div className="card">
                {g.issues.length === 0 && <p className="success">No issues.</p>}
                {g.issues.length > 0 && (
                  <table>
                    <thead><tr><th>Severity</th><th>Issue</th><th>Count</th><th>Example</th></tr></thead>
                    <tbody>
                      {g.issues.map((i) => (
                        <tr key={i.code}>
                          <td><Sev s={i.severity} /></td>
                          <td><code>{i.code}</code></td>
                          <td>{i.count}</td>
                          <td>{i.example}<br /><small className="muted">{i.urls.join(', ')}</small></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ))}

          <h2>History</h2>
          <div className="card">
            <table>
              <thead><tr><th>Run</th><th>Pages</th><th>High</th><th>Medium</th><th>Low</th></tr></thead>
              <tbody>
                {report.history.map((h) => (
                  <tr key={h.runId}><td>{when(h.checkedAt)}</td><td>{h.pages}</td><td>{h.high}</td><td>{h.medium}</td><td>{h.low}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Assistant suggestions</h2>
      <p className="muted">
        Drafted by the assistant for flagged pages. Approving only records your decision; apply the text in the web app yourself.
      </p>
      <div className="card">
        {suggestions.length === 0 && <p className="muted">Nothing queued. Ask the assistant to suggest fixes for flagged pages.</p>}
        {suggestions.map((s) => (
          <div key={s._id} className="suggestion">
            <p>
              <b>{s.field}</b> for <code>{s.url}</code> <span className={`pill ${s.status === 'pending' ? 'late' : s.status === 'approved' ? 'present' : 'high'}`}>{s.status}</span>
            </p>
            <p>{s.suggestion}</p>
            {s.reason && <p className="muted">{s.reason}</p>}
            {s.status === 'pending' && (
              <div className="row">
                <button className="btn small" onClick={() => decide(s._id, 'approved')}>Approve</button>
                <button className="btn small ghost" onClick={() => decide(s._id, 'rejected')}>Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
