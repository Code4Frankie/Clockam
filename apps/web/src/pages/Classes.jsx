import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Classes() {
  const { organization, user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const noRule = !organization?.geofence?.enabled && !(organization?.allowedNetworks || []).length;
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('120');
  const [error, setError] = useState('');
  const load = useCallback(() => api('/school/sessions').then(setList).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); api('/courses').then(setCourses).catch(() => {}); }, [load]);

  if (organization && organization.type !== 'school') return <Navigate to="/dashboard" replace />;

  async function start(e) {
    e.preventDefault();
    setError('');
    if (noRule && !window.confirm('No campus location or Wi-Fi rule is set, so a student could mark attendance from outside the classroom if a friend sends them the code.\n\nStart the class anyway?')) return;
    try {
      const s = await api('/school/sessions', { method: 'POST', body: { title, minutes: Number(minutes), ...(courseId ? { courseId } : {}) } });
      navigate(`/classes/${s.id}`);
    } catch (err) { setError(err.message); }
  }

  return (
    <>
      <h1>Classes</h1>
      <p className="muted">Start a class, then show the code screen on the projector. Students scan it and confirm with their phone.</p>
      {noRule && (
        <p className="warn"><strong>No campus rule set.</strong> Anyone with the code could mark attendance from outside the classroom. {['owner', 'admin'].includes(user.role) ? <>Turn on the location check or add the campus Wi-Fi in <Link to="/settings">Settings</Link>.</> : 'Ask an admin to turn on the location check or add the campus Wi-Fi in Settings.'}</p>
      )}
      <form className="card row" onSubmit={start}>
        <label>Course (optional)
          <select value={courseId} onChange={(e) => { const c = courses.find((x) => x.id === e.target.value); setCourseId(e.target.value); if (c && !title) setTitle(`${c.code} ${c.title}`); }}>
            <option value="">No course</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}
          </select>
        </label>
        <label style={{ flex: 2 }}>Class name<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="CSC 201 – Data Structures" required minLength={2} /></label>
        <label>Open for
          <select value={minutes} onChange={(e) => setMinutes(e.target.value)}>
            {[[30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [180, '3 hours'], [480, '8 hours']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <button className="btn">Start class</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="card">
        {list.length === 0 ? <p className="muted">No classes yet. Start one above.</p> : (
          <table>
            <thead><tr><th>Class</th><th>Lecturer</th><th>Started</th><th>Present</th><th /></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>{c.title}</td><td>{c.lecturer}</td>
                  <td>{new Date(c.startedAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td>{c.present}</td>
                  <td><Link className="btn small ghost" to={`/classes/${c.id}`}>{c.live ? 'Open screen' : 'View'}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
