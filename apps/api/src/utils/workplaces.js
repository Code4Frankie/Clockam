import { billingState } from './billing.js';

// One row per workplace for the platform admin list. Counts and contact details only, never attendance records.
export function buildRows({ orgs, owners, people, lastClockIn, lastClass, plan, enforced, now = new Date() }) {
  return orgs.map((o) => {
    const id = String(o._id);
    const owner = owners.get(id);
    const times = [lastClockIn.get(id), lastClass.get(id)].filter(Boolean).map((d) => new Date(d));
    const lastActive = times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null;
    const state = billingState({ plan, billing: o.billing, createdAt: o.createdAt, now, enforced });
    return {
      id, name: o.name, workplaceId: o.slug, type: o.type || 'workplace', createdAt: o.createdAt,
      people: people.get(id) || 0, lastActive, billing: state.status,
      ownerName: owner?.name || '', ownerEmail: owner?.email || '',
    };
  });
}

export function filterRows(rows, q) {
  const s = String(q ?? '').trim().toLowerCase();
  if (!s) return rows;
  return rows.filter((r) => [r.name, r.workplaceId, r.ownerName, r.ownerEmail].some((v) => String(v).toLowerCase().includes(s)));
}
