import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Courses() {
  const { organization } = useAuth();
  const [list, setList] = useState([]);
  const [f, setF] = useState({ code: '', title: '' });
  const [error, setError] = useState('');
  const load = useCallback(() => api('/courses').then(setList).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (organization && organization.type !== 'school') return <Navigate to="/dashboard" replace />;

  async function add(e) {
    e.preventDefault();
    setError('');
    try { await api('/courses', { method: 'POST', body: f }); setF({ code: '', title: '' }); load(); } catch (err) { setError(err.message); }
  }

  return (
    <>
      <h1>Courses</h1>
      <p className="muted">Add a course and its student list. Classes started for a course show who is absent, and the course report shows each student's attendance.</p>
      <form className="card row" onSubmit={add}>
        <label>Course code<input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="CSC201" required minLength={2} maxLength={20} /></label>
        <label style={{ flex: 2 }}>Title<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Data Structures" required minLength={2} /></label>
        <button className="btn">Add course</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="card">
        {list.length === 0 ? <p className="muted">No courses yet. Add one above.</p> : (
          <table>
            <thead><tr><th>Course</th><th>Students</th><th>Classes held</th><th /></tr></thead>
            <tbody>{list.map((c) => (
              <tr key={c.id}><td><strong>{c.code}</strong> {c.title}</td><td>{c.students}</td><td>{c.classes}</td>
                <td><Link className="btn small ghost" to={`/courses/${c.id}`}>Open</Link></td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
