import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

const empty = { name: '', email: '', staffId: '', department: '', phone: '', role: 'employee', password: '' };

export default function Employees() {
  const { user } = useAuth();
  const canEdit = ['owner', 'admin'].includes(user.role);
  const [list, setList] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [editFor, setEditFor] = useState(null);
  const [edit, setEdit] = useState({});
  const [resetFor, setResetFor] = useState(null);
  const [newPw, setNewPw] = useState('');
  const [notice, setNotice] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = () => api('/employees').then(setList).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/employees', { method: 'POST', body: form });
      setForm(empty);
      load();
    } catch (err) { setError(err.message); }
  }

  const guard = (p) => p.catch((e) => setError(e.message));
  const toggle = (u) => guard(api(`/employees/${u._id}`, { method: 'PATCH', body: { active: !u.active } }).then(load));
  const clearPrints = (u) =>
    confirm(`Remove all fingerprints for ${u.name}?`) && guard(api(`/employees/${u._id}/fingerprints`, { method: 'DELETE' }).then(load));
  // The owner can only be changed by themselves, and only the owner can change admins.
  const canManage = (u) => canEdit && u.role !== 'owner' && (user.role === 'owner' || u.role !== 'admin');

  const setE = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  function startEdit(u) {
    setEditFor(editFor === u._id ? null : u._id);
    setResetFor(null);
    setNotice('');
    setEdit({ name: u.name, email: u.email, staffId: u.staffId, department: u.department || '', phone: u.phone || '', role: u.role });
  }
  async function saveEdit(e, u) {
    e.preventDefault();
    setError('');
    try {
      const body = { name: edit.name.trim(), email: edit.email.trim(), staffId: edit.staffId.trim(), department: edit.department.trim(), phone: edit.phone.trim() };
      if (edit.role !== u.role) body.role = edit.role;
      await api(`/employees/${u._id}`, { method: 'PATCH', body });
      setNotice(`Saved changes for ${edit.name.trim()}.`);
      setEditFor(null);
      load();
    } catch (err) { setError(err.status === 400 && err.details ? Object.values(err.details).flat()[0] || err.message : err.message); }
  }

  async function savePassword(e, u) {
    e.preventDefault();
    setError('');
    try {
      const r = await api(`/employees/${u._id}/reset-password`, { method: 'POST', body: { password: newPw } });
      setNotice(r.message);
      setResetFor(null);
      setNewPw('');
    } catch (err) { setError(err.message); }
  }

  return (
    <>
      <h1>Employees</h1>
      {canEdit && (
        <form className="card grid-form" onSubmit={add}>
          <input placeholder="Full name" value={form.name} onChange={set('name')} required />
          <input placeholder="Staff ID" value={form.staffId} onChange={set('staffId')} required />
          <input type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
          <input placeholder="Department" value={form.department} onChange={set('department')} />
          <input placeholder="Phone" value={form.phone} onChange={set('phone')} />
          <select value={form.role} onChange={set('role')}>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            {user.role === 'owner' && <option value="admin">Admin</option>}
          </select>
          <PasswordInput minLength={8} placeholder="Temporary password" label="Show password" value={form.password} onChange={set('password')} required />
          <button className="btn">Add employee</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      {notice && <p className="success" role="status">{notice}</p>}
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Staff ID</th><th>Dept</th><th>Role</th><th>Fingerprints</th><th></th></tr></thead>
          <tbody>
            {list.map((u) => [
              <tr key={u._id} className={u.active ? '' : 'dim'}>
                <td>{u.name}<br /><small className="muted">{u.email}</small></td>
                <td>{u.staffId}</td><td>{u.department || '—'}</td><td>{u.role}</td>
                <td>{u.webauthnCredentials.length} phone/PC · {u.scannerLinks.length} scanner</td>
                <td className="actions">
                  {canManage(u) && <button className="btn small ghost" onClick={() => startEdit(u)}>Edit</button>}
                  {canManage(u) && <button className="btn small ghost" onClick={() => toggle(u)}>{u.active ? 'Disable' : 'Enable'}</button>}
                  {canManage(u) && <button className="btn small ghost" onClick={() => clearPrints(u)}>Reset prints</button>}
                  {canManage(u) && <button className="btn small ghost" onClick={() => { setResetFor(resetFor === u._id ? null : u._id); setEditFor(null); setNewPw(''); setNotice(''); }}>Set password</button>}
                </td>
              </tr>,
              editFor === u._id && (
                <tr key={`${u._id}-edit`}>
                  <td colSpan={6}>
                    <form className="grid-form" onSubmit={(e) => saveEdit(e, u)}>
                      <input placeholder="Full name" value={edit.name} onChange={setE('name')} required minLength={2} />
                      <input placeholder="Staff ID" value={edit.staffId} onChange={setE('staffId')} required />
                      <input type="email" placeholder="Email" value={edit.email} onChange={setE('email')} required />
                      <input placeholder="Department" value={edit.department} onChange={setE('department')} />
                      <input placeholder="Phone" value={edit.phone} onChange={setE('phone')} />
                      <select value={edit.role} onChange={setE('role')}>
                        <option value="employee">Employee</option>
                        <option value="manager">Manager</option>
                        {(user.role === 'owner' || u.role === 'admin') && <option value="admin">Admin</option>}
                      </select>
                      <button className="btn small">Save changes</button>
                      <button type="button" className="btn small ghost" onClick={() => setEditFor(null)}>Cancel</button>
                    </form>
                    <small className="muted">The person's fingerprints and attendance history are not changed.</small>
                  </td>
                </tr>
              ),
              resetFor === u._id && (
                <tr key={`${u._id}-pw`}>
                  <td colSpan={6}>
                    <form className="row" onSubmit={(e) => savePassword(e, u)}>
                      <PasswordInput minLength={8} placeholder={`New password for ${u.name}`} label="Show password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required autoFocus />
                      <button className="btn small">Save password</button>
                      <button type="button" className="btn small ghost" onClick={() => setResetFor(null)}>Cancel</button>
                    </form>
                    <small className="muted">They will be signed out everywhere. Tell them the new password privately.</small>
                  </td>
                </tr>
              ),
            ])}
          </tbody>
        </table>
      </div>
    </>
  );
}
