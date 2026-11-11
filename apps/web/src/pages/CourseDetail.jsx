import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, downloadFile } from '../api.js';
import { useAuth } from '../auth.jsx';
import { matricsFromCsv } from '../studentCsv.js';

export default function CourseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [report, setReport] = useState(null);
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([api(`/courses/${id}`), api(`/courses/${id}/report`)]);
      setCourse(c); setReport(r);
    } catch (e) { setError(e.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setText(matricsFromCsv(await file.text()));
  }
  async function save() {
    setBusy(true); setError(''); setResult(null);
    try { setResult(await api(`/courses/${id}/students`, { method: 'PUT', body: { text } })); setText(''); load(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm('Remove this course? Past classes are kept.')) return;
    await api(`/courses/${id}`, { method: 'DELETE' });
    navigate('/courses');
  }

  if (error && !course) return <p className="error">{error}</p>;
  if (!course) return <p className="center">Loading…</p>;

  return (
    <>
      <p><Link to="/courses">← Courses</Link></p>
      <h1>{course.code} {course.title}</h1>

      <div className="card">
        <h2>Student list ({course.students.length})</h2>
        <p className="muted">Paste matric numbers (one per line) or upload a CSV with a "Matric number" column. This <strong>replaces</strong> the current list. Students must already be on the school's Students page.</p>
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'CSC/2020/001\nCSC/2020/002'} style={{ width: '100%' }} />
        <div className="row" style={{ marginTop: 8 }}>
          <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} />
          <button className="btn" disabled={busy || !text.trim()} onClick={save}>{busy ? 'Saving…' : 'Save student list'}</button>
        </div>
        {result && (
          <div>
            <p className="success">{result.count} students on this course.</p>
            {result.unknown.length > 0 && <p className="warn">{result.unknown.length} not on the Students page yet, so skipped: {result.unknown.slice(0, 10).join(', ')}{result.unknown.length > 10 ? '…' : ''}</p>}
            {result.invalid.length > 0 && <p className="warn">Not valid matric numbers: {result.invalid.slice(0, 10).join(', ')}</p>}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      {report && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>Attendance report ({report.held} {report.held === 1 ? 'class' : 'classes'} held)</h2>
            <button className="btn small ghost" onClick={() => downloadFile(`/courses/${id}/report.csv`, `${course.code}-attendance.csv`)}>Download CSV</button>
          </div>
          {report.rows.length === 0 ? <p className="muted">No students on this course yet.</p> : (
            <table>
              <thead><tr><th>Name</th><th>Matric number</th><th>Attended</th><th>%</th></tr></thead>
              <tbody>{report.rows.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.matric}</td><td>{r.attended} of {report.held}</td><td>{r.percent}%</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
      {['owner', 'admin'].includes(user.role) && <button className="btn ghost" onClick={remove}>Remove course</button>}
    </>
  );
}
