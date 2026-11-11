import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { parseStudents } from '../studentCsv.js';

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function saveCodes(codes) {
  const csv = ['Name,Matric number,Set-up code', ...codes.map((c) => [c.name, c.matric, c.code].map(cell).join(','))].join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'student-setup-codes.csv' });
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Students() {
  const { organization } = useAuth();
  const [list, setList] = useState([]);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/school/students').then(setList).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  if (organization && organization.type !== 'school') return <Navigate to="/dashboard" replace />;
  const link = `${window.location.origin}/enrol?org=${organization?.slug}`;

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    setError(''); setResult(null);
    if (!file) return;
    setPreview(parseStudents(await file.text()));
  }

  async function confirmImport() {
    setBusy(true); setError('');
    try {
      const r = await api('/school/students/import', { method: 'POST', body: { students: preview.students } });
      setResult(r); setPreview(null); load();
    } catch (err) {
      setError((err.details && Object.values(err.details).flat()[0]) || err.message);
    } finally { setBusy(false); }
  }

  async function newCode(s) {
    setError('');
    try {
      const r = await api(`/school/students/${s.id}/enrol-code`, { method: 'POST' });
      setResult({ added: 0, skipped: [], codes: [r], codesValidDays: r.codesValidDays });
    } catch (err) { setError(err.message); }
  }
  async function resetPhones(s) {
    if (!window.confirm(`Remove ${s.name}'s phones? They will need a new set-up code.`)) return;
    try { await api(`/employees/${s.id}/fingerprints`, { method: 'DELETE' }); setMsg('Phones removed. Give them a new code.'); load(); } catch (err) { setError(err.message); }
  }
  async function toggle(s) {
    try { await api(`/school/students/${s.id}`, { method: 'PATCH', body: { active: !s.active } }); load(); } catch (err) { setError(err.message); }
  }

  return (
    <>
      <h1>Students</h1>
      <p className="muted">Upload your student list. Each student gets a one-time code to set up their phone, then marks attendance in class with their matric number and the phone's face or fingerprint check.</p>

      <div className="card">
        <h2>Upload a list</h2>
        <p className="muted">A CSV file (save from Excel or Google Sheets) with columns <strong>Name</strong>, <strong>Matric number</strong> and optionally <strong>Department</strong>. Up to 2000 students at a time.</p>
        <input type="file" accept=".csv,text/csv" onChange={onFile} />
        {preview && (
          <div style={{ marginTop: 12 }}>
            <p><strong>{preview.students.length}</strong> students ready to add.</p>
            {preview.problems.length > 0 && <ul className="error">{preview.problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}{preview.problems.length > 8 && <li>…and {preview.problems.length - 8} more</li>}</ul>}
            <button className="btn" disabled={busy || !preview.students.length} onClick={confirmImport}>{busy ? 'Adding…' : `Add ${preview.students.length} students`}</button>{' '}
            <button className="btn ghost" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        )}
      </div>

      {result && (
        <div className="card">
          <h2>Set-up codes</h2>
          <p>{result.codes.length} code{result.codes.length === 1 ? '' : 's'} created. <strong>They are shown only now</strong>, so download them before leaving this page. Each works once and expires in {result.codesValidDays} days.</p>
          {result.skipped.length > 0 && <p className="muted">Skipped {result.skipped.length}: {result.skipped.slice(0, 5).map((s) => `${s.matric} (${s.reason})`).join('; ')}{result.skipped.length > 5 ? '…' : ''}</p>}
          {result.codes.length <= 3 && result.codes.map((c) => <p key={c.matric}><strong>{c.name}</strong> {c.matric}: <code>{c.code}</code></p>)}
          <button className="btn" onClick={() => saveCodes(result.codes)}>Download codes (CSV)</button>
          <p className="muted">Give students this link to set up their phone: <code>{link}</code></p>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {msg && <p className="success">{msg}</p>}
      <div className="card">
        {list.length === 0 ? <p className="muted">No students yet. Upload a list above.</p> : (
          <table>
            <thead><tr><th>Name</th><th>Matric number</th><th>Phone</th><th /></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}{!s.active && <small className="muted"> (disabled)</small>}</td>
                  <td>{s.matric}</td>
                  <td>{s.devices ? `Set up (${s.devices})` : 'Not set up'}</td>
                  <td>
                    <button className="btn small ghost" onClick={() => newCode(s)}>New code</button>{' '}
                    {s.devices > 0 && <button className="btn small ghost" onClick={() => resetPhones(s)}>Remove phones</button>}{' '}
                    <button className="btn small ghost" onClick={() => toggle(s)}>{s.active ? 'Disable' : 'Enable'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
