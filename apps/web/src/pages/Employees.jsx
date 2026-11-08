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
                  {canManage(u) && <button className="btn small ghost" onClick={() => toggle(u)}>{u.active ? 'Disable' : 'Enable'}</button>}
                  {canManage(u) && <button className="btn small ghost" onClick={() => clearPrints(u)}>Reset prints</button>}
                  {canManage(u) && <button className="btn small ghost" onClick={() => { setResetFor(resetFor === u._id ? null : u._id); setNewPw(''); setNotice(''); }}>Set password</button>}
                </td>
              </tr>,
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
