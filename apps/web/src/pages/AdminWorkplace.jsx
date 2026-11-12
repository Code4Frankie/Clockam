import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatNaira } from '../money.js';
import { typeLabel } from '../orgTypes.js';

const day = (d) => (d ? new Date(d).toLocaleDateString('en-NG', { dateStyle: 'medium' }) : '—');
const STATUS = { free: 'Free for now', exempt: 'Billing waived', trial: 'Free trial', active: 'Paid', grace: 'Payment due', overdue: 'Expired' };

// A platform admin's view of one workplace's billing: what the owner sees, plus trial, package and waiver controls.
export default function AdminWorkplace() {
  const { user } = useAuth();
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [days, setDays] = useState('7');
  const [pkg, setPkg] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const load = useCallback(() => api(`/platform/workplaces/${id}`).then((x) => { setD(x); setPkg(x.subscribed || ''); }).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  if (!user.isPlatformAdmin) return <Navigate to="/dashboard" replace />;
  if (!d) return error ? <p className="error">{error}</p> : <p className="center">Loading…</p>;

  async function act(path, body, ok) {
    setError(''); setNote('');
    try { setD(await api(`/platform/workplaces/${id}/${path}`, { method: 'POST', body })); setNote(ok); }
    catch (e) { setError(e.message); }
  }
  const { state, charge, plan } = d;

  return (
    <>
      <p><Link to="/admin/workplaces">← Workplaces</Link></p>
      <h1>{d.name}</h1>
      <p className="muted">{d.workplaceId} · {typeLabel(d.type)} · created {day(d.createdAt)} · {d.workers} {d.workers === 1 ? 'person' : 'people'}{d.suspended ? ` · Suspended: ${d.suspendedReason}` : ''}</p>
      {note && <p className="success">{note}</p>}
      {error && <p className="error">{error}</p>}

      <div className="card">
        <h2>{STATUS[state.status]}</h2>
        {state.status === 'trial' && <p>Trial ends {day(d.trialEnds)} ({state.daysLeft} {state.daysLeft === 1 ? 'day' : 'days'} left).</p>}
        {state.status === 'active' && <p>Paid until {day(state.until)}.</p>}
        {['grace', 'overdue'].includes(state.status) && <p>Trial ended {day(d.trialEnds)}. Paid until {day(d.paidUntil)}.</p>}
        <p>Package: <strong>{d.subscribed || 'none chosen yet'}</strong></p>
      </div>

      <div className="card">
        <h2>Extend trial</h2>
        <p className="muted">Adds days to the end of the current trial, or from today if it has already ended.</p>
        <div className="row">
          <label>Days to add<input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" style={{ width: 100 }} /></label>
          <button className="btn" onClick={() => act('extend-trial', { days: Number(days) }, 'Trial extended.')}>Extend trial</button>
        </div>
      </div>

      <div className="card">
        <h2>Package</h2>
        <div className="row">
          <label>Assign a package
            <select value={pkg} onChange={(e) => setPkg(e.target.value)}>
              <option value="">None</option>
              {plan.packages.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </label>
          <button className="btn" onClick={() => act('package', { packageName: pkg || null }, 'Package updated.')}>Save package</button>
        </div>
        <p className="muted">The owner can also choose a package under Billing.</p>
      </div>

      <div className="card">
        <h2>Billing waiver</h2>
        <p className="muted">{d.billingWaived ? 'Billing is waived. This workplace is never charged or locked.' : 'Waiving billing means this workplace is never charged or locked.'}</p>
        <button className="btn ghost" onClick={() => act('billing-exempt', { exempt: !d.billingWaived }, d.billingWaived ? 'Billing switched back on.' : 'Billing waived.')}>{d.billingWaived ? 'Switch billing back on' : 'Waive billing'}</button>
      </div>

      {!d.exempt && (
        <div className="card">
          <h2>Next payment</h2>
          {charge ? (
            <table><tbody>
              <tr><td>{charge.packageName}, 30 days</td><td>{formatNaira(charge.monthly)}</td></tr>
              {charge.setupFee > 0 && <tr><td>One-time setup fee</td><td>{formatNaira(charge.setupFee)}</td></tr>}
              {charge.vat > 0 && <tr><td>VAT ({plan.vatPercent}%)</td><td>{formatNaira(charge.vat)}</td></tr>}
              <tr><td><strong>Total</strong></td><td><strong>{formatNaira(charge.total)}</strong></td></tr>
            </tbody></table>
          ) : <p className="muted">No package chosen yet, so nothing is due.</p>}
        </div>
      )}

      {d.payments.length > 0 && (
        <div className="card">
          <h2>Payments</h2>
          <table>
            <thead><tr><th>Date</th><th>Package</th><th>Amount</th></tr></thead>
            <tbody>{d.payments.map((p) => <tr key={p.reference}><td>{day(p.paidAt)}</td><td>{p.tierName}</td><td>{formatNaira(p.amount)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
