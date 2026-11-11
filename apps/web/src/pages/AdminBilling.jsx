import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { koboToNairaText, nairaToKobo } from '../money.js';

const blank = () => ({ name: '', min: '', max: '', price: '' });
const fromPlan = (p) => ({
  setupFee: koboToNairaText(p.setupFee), vat: String(p.vatPercent), trial: String(p.trialDays),
  tiers: p.tiers.map((t) => ({ name: t.name, min: String(t.minWorkers), max: t.maxWorkers == null ? '' : String(t.maxWorkers), price: koboToNairaText(t.monthlyPrice) })),
});

// Frankiecode staff set plan prices here. Nothing about prices is written in code.
export default function AdminBilling() {
  const { user } = useAuth();
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/billing/admin/plan').then((p) => setF(fromPlan(p))).catch((e) => setMsg({ type: 'err', text: e.message })); }, []);
  if (!user.isPlatformAdmin) return <Navigate to="/dashboard" replace />;
  if (!f) return msg.text ? <p className="error">{msg.text}</p> : <p className="center">Loading…</p>;

  const setTier = (i, k) => (e) => setF({ ...f, tiers: f.tiers.map((t, j) => (j === i ? { ...t, [k]: e.target.value } : t)) });

  async function save(e) {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    const setupFee = nairaToKobo(f.setupFee);
    const tiers = f.tiers.map((t) => ({ name: t.name.trim(), minWorkers: Number(t.min), maxWorkers: t.max.trim() === '' ? null : Number(t.max), monthlyPrice: nairaToKobo(t.price) }));
    if (setupFee === null || tiers.some((t) => t.monthlyPrice === null)) return setMsg({ type: 'err', text: 'Enter prices as plain naira amounts, for example 25000 or 12500.50.' });
    setBusy(true);
    try {
      const saved = await api('/billing/admin/plan', { method: 'PUT', body: { setupFee, vatPercent: Number(f.vat), trialDays: Number(f.trial), tiers } });
      setF(fromPlan(saved));
      setMsg({ type: 'ok', text: 'Saved. New prices apply to the next payment. Payments already made are not changed.' });
    } catch (err) {
      const d = err.details && typeof err.details === 'object' && Object.values(err.details).flat()[0];
      setMsg({ type: 'err', text: d || err.message });
    } finally { setBusy(false); }
  }

  return (
    <>
      <h1>Plans and prices</h1>
      <p className="muted">Prices are in naira. With no plans listed, nothing is charged and nobody is locked out. Each payment buys 30 days. People are counted as active accounts other than the owner.</p>
      <form className="card" onSubmit={save}>
        <div className="grid2">
          <label>One-time setup fee (₦)<input value={f.setupFee} onChange={(e) => setF({ ...f, setupFee: e.target.value })} inputMode="decimal" required /></label>
          <label>VAT (%) added to each payment<input value={f.vat} onChange={(e) => setF({ ...f, vat: e.target.value })} inputMode="decimal" required /></label>
          <label>Free trial (days)<input value={f.trial} onChange={(e) => setF({ ...f, trial: e.target.value })} inputMode="numeric" required /></label>
        </div>
        <h2>Plans by number of people</h2>
        {f.tiers.length === 0 && <p className="muted">No plans yet. Add one.</p>}
        {f.tiers.map((t, i) => (
          <div className="row" key={i}>
            <label>Name<input value={t.name} onChange={setTier(i, 'name')} required /></label>
            <label>From<input value={t.min} onChange={setTier(i, 'min')} inputMode="numeric" required style={{ width: 90 }} /></label>
            <label>To (blank = no limit)<input value={t.max} onChange={setTier(i, 'max')} inputMode="numeric" style={{ width: 120 }} /></label>
            <label>Price per 30 days (₦)<input value={t.price} onChange={setTier(i, 'price')} inputMode="decimal" required /></label>
            <button type="button" className="btn small ghost" onClick={() => setF({ ...f, tiers: f.tiers.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        <p>
          <button type="button" className="btn ghost" onClick={() => {
            const last = f.tiers[f.tiers.length - 1];
            setF({ ...f, tiers: [...f.tiers, { ...blank(), min: last && last.max ? String(Number(last.max) + 1) : '1' }] });
          }}>Add a plan</button>
        </p>
        {msg.text && <p className={msg.type === 'ok' ? 'success' : 'error'}>{msg.text}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save prices'}</button>
      </form>
    </>
  );
}
