import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [name, setName] = useState('');
  const [created, setCreated] = useState(null);
  const [link, setLink] = useState({ deviceId: '', userId: '', scannerUserId: '' });
  const [msg, setMsg] = useState('');

  const load = () => {
    api('/devices').then(setDevices);
    api('/employees').then(setEmployees);
  };
  useEffect(() => { load(); }, []);

  async function register(e) {
    e.preventDefault();
    setCreated(await api('/devices', { method: 'POST', body: { name, type: 'scanner' } }));
    setName('');
    load();
  }

  async function linkEmployee(e) {
    e.preventDefault();
    setMsg('');
    try {
      const { deviceId, ...body } = link;
      await api(`/devices/${deviceId}/link-employee`, { method: 'POST', body });
      setMsg('Linked.');
      setLink({ ...link, scannerUserId: '' });
    } catch (err) { setMsg(err.message); }
  }

  return (
    <>
      <h1>Scanners &amp; kiosks</h1>
      <p className="muted">
        Register each USB or handheld scanner here. Enrol fingerprints on the scanner (or its vendor software), then link each
        employee to the user ID the scanner assigned.
      </p>

      <form className="card row" onSubmit={register}>
        <input placeholder="Device name (e.g. Front desk scanner)" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="btn">Register device</button>
      </form>

      {created && (
        <div className="card notice">
          <b>Save these now — the key is shown only once.</b>
          <p>Device ID: <code>{created.id}</code></p>
          <p>API key: <code>{created.apiKey}</code></p>
          <p className="muted">Enter both on the kiosk screen under “Scanner settings”.</p>
        </div>
      )}

      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Device ID</th><th>Last seen</th><th>Active</th></tr></thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d._id}>
                <td>{d.name}</td><td><code>{d._id}</code></td>
                <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'never'}</td>
                <td>{d.active ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Link an employee to a scanner ID</h2>
      <form className="card grid-form" onSubmit={linkEmployee}>
        <select value={link.deviceId} onChange={(e) => setLink({ ...link, deviceId: e.target.value })} required>
          <option value="">Choose device</option>
          {devices.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
        <select value={link.userId} onChange={(e) => setLink({ ...link, userId: e.target.value })} required>
          <option value="">Choose employee</option>
          {employees.map((u) => <option key={u._id} value={u._id}>{u.name} ({u.staffId})</option>)}
        </select>
        <input placeholder="User ID on the scanner" value={link.scannerUserId} onChange={(e) => setLink({ ...link, scannerUserId: e.target.value })} required />
        <button className="btn">Link</button>
        {msg && <p className="muted">{msg}</p>}
      </form>
    </>
  );
}
