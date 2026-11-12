import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { koboToNairaText, nairaToKobo } from '../money.js';

const blank = () => ({ name: '', description: '', price: '', setup: '0', max: '' });
const fromPlan = (p) => ({
  vat: String(p.vatPercent), trial: String(p.trialDays),
  packages: p.packages.map((x) => ({ name: x.name, description: x.description || '', price: koboToNairaText(x.monthlyPrice), setup: koboToNairaText(x.setupFee), max: x.maxPeople == null ? '' : String(x.maxPeople) })),
});

// Frankiecode staff make the packages here. Workplace owners choose one, and only that package appears in their next payment.
export default function AdminBilling() {
  const { user } = useAuth();
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/billing/admin/plan').then((p) => setF(fromPlan(p))).catch((e) => setMsg({ type: 'err', text: e.message })); }, []);
  if (!user.isPlatformAdmin) return <Navigate to="/dashboard" replace />;
  if (!f) return msg.text ? <p className="error">{msg.text}</p> : <p className="center">Loading…</p>;

  const setPkg = (i, k) => (e) => setF({ ...f, packages: f.packages.map((t, j) => (j === i ? { ...t, [k]: e.target.value } : t)) });

  async function save(e) {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    const packages = f.packages.map((t) => ({ name: t.name.trim(), description: t.description.trim(), monthlyPrice: nairaToKobo(t.price), setupFee: nairaToKobo(t.setup || '0'), maxPeople: t.max.trim() === '' ? null : Number(t.max) }));
    if (packages.some((t) => t.monthlyPrice === null || t.setupFee === null)) return setMsg({ type: 'err', text: 'Enter prices as plain naira amounts, for example 25000 or 12500.50.' });
    setBusy(true);
    try {
      const saved = await api('/billing/admin/plan', { method: 'PUT', body: { vatPercent: Number(f.vat), trialDays: Number(f.trial), packages } });
      setF(fromPlan(saved));
      setMsg({ type: 'ok', text: 'Saved. Changes apply to the next payment. Payments already made are not changed.' });
    } catch (err) {
      const d = err.details && typeof err.details === 'object' && Object.values(err.details).flat()[0];
      setMsg({ type: 'err', text: d || err.message });
    } finally { setBusy(false); }
  }

  return (
    <>
      <h1>Packages</h1>
      <p className="muted">Make the packages workplace owners can subscribe to. Each owner pays only for the package they choose, plus VAT. Prices are in naira and each payment buys 30 days. With no packages, nothing is charged and nobody is locked out. Your own workplace is never charged.</p>
      <form className="card" onSubmit={save}>
        <div className="grid2">
          <label>VAT (%) added to each payment<input value={f.vat} onChange={(e) => setF({ ...f, vat: e.target.value })} inputMode="decimal" required /></label>
          <label>Free trial for new workplaces (days)<input value={f.trial} onChange={(e) => setF({ ...f, trial: e.target.value })} inputMode="numeric" required /></label>
        </div>
        <h2>Packages</h2>
        {f.packages.length === 0 && <p className="muted">No packages yet. Add one.</p>}
        {f.packages.map((t, i) => (
          <div className="row" key={i}>
            <label>Name<input value={t.name} onChange={setPkg(i, 'name')} required maxLength={40} /></label>
            <label style={{ flex: 2 }}>Short description<input value={t.description} onChange={setPkg(i, 'description')} maxLength={120} /></label>
            <label>Price per 30 days (₦)<input value={t.price} onChange={setPkg(i, 'price')} inputMode="decimal" required /></label>
            <label>Setup fee (₦, once)<input value={t.setup} onChange={setPkg(i, 'setup')} inputMode="decimal" required /></label>
            <label>Most people (blank = no limit)<input value={t.max} onChange={setPkg(i, 'max')} inputMode="numeric" style={{ width: 120 }} /></label>
            <button type="button" className="btn small ghost" onClick={() => setF({ ...f, packages: f.packages.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        <p><button type="button" className="btn ghost" onClick={() => setF({ ...f, packages: [...f.packages, blank()] })}>Add a package</button></p>
        {msg.text && <p className={msg.type === 'ok' ? 'success' : 'error'}>{msg.text}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save packages'}</button>
      </form>
    </>
  );
}
