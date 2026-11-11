import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, downloadFile, fetchBlobUrl, fmtTime } from '../api.js';

// Full-screen view for the projector: a QR code and a 6-digit code that both change every 30 seconds.
export default function ClassScreen() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [showList, setShowList] = useState(false);
  const [absent, setAbsent] = useState([]);
  const [hasCourse, setHasCourse] = useState(false);
  const [photo, setPhoto] = useState(null);
  const lastUrl = useRef('');

  const poll = useCallback(async () => {
    try {
      const next = await api(`/school/sessions/${id}/display`);
      setD(next);
      setError('');
      if (next.url && next.url !== lastUrl.current) {
        lastUrl.current = next.url;
        setQr(await QRCode.toDataURL(next.url, { margin: 1, width: 420, errorCorrectionLevel: 'M' }));
      }
    } catch (e) { setError(e.message); }
  }, [id]);

  // Poll again when the current code is due to change, and at least every 5 seconds for the headcount.
  useEffect(() => {
    poll();
    const t = setInterval(poll, 4000);
    return () => clearInterval(t);
  }, [poll]);

  async function loadList() {
    const r = await api(`/school/sessions/${id}/attendance`);
    setRows(r.present);
    setAbsent(r.absent || []);
    setHasCourse(!!r.hasCourse);
    setShowList(true);
  }
  async function showPhoto(s) {
    try { setPhoto({ name: s.name, url: await fetchBlobUrl(`/school/sessions/${id}/selfie/${s.id}`) }); } catch (e) { setError(e.message); }
  }
  async function end() {
    if (!window.confirm('End this class? Students will no longer be able to mark attendance.')) return;
    await api(`/school/sessions/${id}/end`, { method: 'POST' });
    poll();
  }

  if (error && !d) return <p className="error">{error}</p>;
  if (!d) return <p className="center">Loading…</p>;

  return (
    <div className="class-screen">
      <h1>{d.title}</h1>
      {d.live ? (
        <>
          <p className="muted">Scan with your phone camera, or open the site and type the code.</p>
          {qr && <img className="class-qr" src={qr} alt="QR code for marking attendance" />}
          <div className="class-code" aria-live="off">{d.code.slice(0, 3)} {d.code.slice(3)}</div>
          <p className="muted">The code changes every 30 seconds.</p>
        </>
      ) : <p className="error">This class has ended.</p>}
      <p className="class-count"><strong>{d.present}</strong> present</p>
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn ghost" onClick={loadList}>Show who is present</button>
        <button className="btn ghost" onClick={() => downloadFile(`/school/sessions/${id}/export.csv`, 'class-attendance.csv')}>Download list</button>
        {d.live && <button className="btn" onClick={end}>End class</button>}
        <Link className="btn ghost" to="/classes">All classes</Link>
      </div>
      {showList && (
        <div className="card" style={{ textAlign: 'left', marginTop: 16 }}>
          {rows.length === 0 ? <p className="muted">Nobody yet.</p> : (
            <table><thead><tr><th>Name</th><th>Matric number</th><th>Time</th><th>Photo</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.matric}><td>{r.name}{r.flags?.includes('not-on-course-list') && <small className="muted"> (not on course list)</small>}</td><td>{r.matric}</td><td>{fmtTime(r.at)}</td>
                  <td>{r.hasSelfie ? <button className="btn small ghost" onClick={() => showPhoto(r)}>View</button> : '—'}</td></tr>
              ))}</tbody></table>
          )}
          {photo && <div style={{ textAlign: 'center' }}><img className="class-qr" style={{ width: 240 }} src={photo.url} alt={`Selfie of ${photo.name}`} /><p>{photo.name} <button className="btn small ghost" onClick={() => setPhoto(null)}>Close</button></p></div>}
          {hasCourse && absent.length > 0 && (
            <>
              <h3>Absent ({absent.length})</h3>
              <table><tbody>{absent.map((s) => <tr key={s.matric}><td>{s.name}</td><td>{s.matric}</td></tr>)}</tbody></table>
            </>
          )}
          <p className="muted">Names are hidden from the projector. Close this list before projecting.</p>
        </div>
      )}
    </div>
  );
}
