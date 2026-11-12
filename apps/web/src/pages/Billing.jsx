import { useCallback, useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatNaira } from '../money.js';

const STATUS = {
  free: 'Free for now',
  exempt: 'Billing waived',
  trial: 'Free trial',
  active: 'Paid',
  grace: 'Payment due',
  overdue: 'Expired',
};

export default function Billing() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/billing/status').then(setD).catch((e) => setError(e.message)), []);

  useEffect(() => {
    const ref = params.get('reference') || params.get('trxref');
    if (!ref) { load(); return; }
    // Back from the payment page: ask the server to confirm with Paystack.
    api(`/billing/verify/${encodeURIComponent(ref)}`)
      .then((r) => setNote(r.status === 'success' ? 'Payment received. Thank you.' : 'We have not received this payment yet. If you were charged, it will show here within a few minutes.'))
      .catch((e) => setError(e.message))
      .finally(() => { setParams({}, { replace: true }); load(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!['owner', 'admin'].includes(user.role)) return <Navigate to="/dashboard" replace />;

  async function pay() {
    setBusy(true); setError('');
    try { window.location.assign((await api('/billing/checkout', { method: 'POST', body: { provider: 'paystack' } })).url); }
    catch (e) { setError(e.message); setBusy(false); }
  }

  if (!d) return error ? <p className="error">{error}</p> : <p className="center">Loading…</p>;
  const { state, charge, plan } = d;
  const isOwner = d.isOwner;

  async function subscribe(name) {
    setBusy(true); setError(''); setNote('');
    try { await api('/billing/subscribe', { method: 'POST', body: { packageName: name } }); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <h1>Billing</h1>
      {note && <p className="success">{note}</p>}
      {error && <p className="error">{error}</p>}

      <div className="card">
        <h2>{STATUS[state.status]}</h2>
        {state.status === 'exempt' && <p>Billing is switched off for this workplace. Nothing is charged and nothing is locked.</p>}
        {state.status === 'free' && <p className="muted">Prices have not been set up yet, so nothing is charged.</p>}
        {state.status === 'trial' && <p>Your free trial ends in {state.daysLeft} {state.daysLeft === 1 ? 'day' : 'days'}.</p>}
        {state.status === 'active' && <p>Paid until {new Date(state.until).toLocaleDateString('en-NG', { dateStyle: 'long' })} ({state.daysLeft} {state.daysLeft === 1 ? 'day' : 'days'} left).</p>}
        {state.status === 'grace' && <p className="warn">Your subscription period has ended. Please pay by {new Date(state.until || Date.now()).toLocaleDateString('en-NG', { dateStyle: 'long' })} to keep using the admin pages. Clock-in keeps working either way.</p>}
        {state.status === 'overdue' && <p className="warn">{d.enforced ? 'Admin pages are locked until you pay. Clock-in still works for everyone.' : 'Your subscription has expired.'}</p>}
        <p className="muted">{d.workers} {d.workers === 1 ? 'person is' : 'people are'} active on your account.</p>
      </div>

      {d.state.status !== 'exempt' && plan.packages.length > 0 && (
        <div className="card">
          <h2>Packages</h2>
          <table>
            <thead><tr><th>Package</th><th>For</th><th>Per 30 days</th><th>Setup fee</th><th></th></tr></thead>
            <tbody>
              {plan.packages.map((p) => (
                <tr key={p.name}>
                  <td><strong>{p.name}</strong>{p.description && <><br /><small className="muted">{p.description}</small></>}</td>
                  <td>{p.maxPeople == null ? 'Any number of people' : `Up to ${p.maxPeople} people`}</td>
                  <td>{formatNaira(p.monthlyPrice)}</td>
                  <td>{p.setupFee > 0 ? formatNaira(p.setupFee) : 'None'}</td>
                  <td>{d.subscribed === p.name ? <strong>Your package</strong> : isOwner && <button className="btn small ghost" disabled={busy || (p.maxPeople != null && d.workers > p.maxPeople)} onClick={() => subscribe(p.name)}>{p.maxPeople != null && d.workers > p.maxPeople ? 'Too small' : 'Choose'}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isOwner && <p className="muted">Only the owner can choose a package and pay.</p>}
        </div>
      )}

      {d.state.status !== 'exempt' && plan.packages.length > 0 && (
        <div className="card">
          <h2>Next payment</h2>
          {charge ? (
            <>
              <table>
                <tbody>
                  <tr><td>{charge.packageName}, 30 days</td><td>{formatNaira(charge.monthly)}</td></tr>
                  {charge.setupFee > 0 && <tr><td>One-time setup fee</td><td>{formatNaira(charge.setupFee)}</td></tr>}
                  {charge.vat > 0 && <tr><td>VAT ({plan.vatPercent}%)</td><td>{formatNaira(charge.vat)}</td></tr>}
                  <tr><td><strong>Total</strong></td><td><strong>{formatNaira(charge.total)}</strong></td></tr>
                </tbody>
              </table>
              {charge.overCapacity && <p className="warn">You have {charge.workers} people and {charge.packageName} allows {charge.maxPeople}. Choose a bigger package to pay.</p>}
              {isOwner && <p><button className="btn" onClick={pay} disabled={busy || !d.canPay || charge.overCapacity}>{busy ? 'Opening…' : 'Pay with Paystack'}</button></p>}
              {isOwner && !d.canPay && <p className="muted">Online payment is not switched on yet.</p>}
              <p className="muted">Paying adds 30 days. Paying early adds to the end of your current period.</p>
            </>
          ) : <p className="muted">Choose a package above to see what you will pay.</p>}
        </div>
      )}

      {d.payments.length > 0 && (
        <div className="card">
          <h2>Payments</h2>
          <table>
            <thead><tr><th>Date</th><th>Plan</th><th>Amount</th></tr></thead>
            <tbody>{d.payments.map((p) => <tr key={p.reference}><td>{new Date(p.paidAt).toLocaleDateString('en-NG', { dateStyle: 'medium' })}</td><td>{p.tierName}</td><td>{formatNaira(p.amount)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
