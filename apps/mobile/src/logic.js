// Pure helpers, kept free of React Native so they can be tested with node:test.

export const todayKey = (timeZone = 'Africa/Lagos', now = new Date()) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now)
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}`;
};

export const fmtTime = (d, timeZone = 'Africa/Lagos') =>
  d ? new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d)) : '—';

// What the main button should do, based on today's record.
export function nextAction(record) {
  if (!record) return { kind: 'in', label: 'Clock in' };
  if (!record.clockOut) return { kind: 'out', label: 'Clock out' };
  return { kind: 'done', label: 'Done for today' };
}

// True while today's record has a break that has started and not ended.
export const isOnBreak = (record) => !!record && !record.clockOut && (record.breaks || []).some((b) => b.start && !b.end);

export const needsLocation = (organization) => !!organization?.geofence?.enabled;

export function friendlyError(err) {
  const m = String(err?.message || err || '');
  if (/network request failed|failed to fetch/i.test(m)) return 'Cannot reach ClockAm. Check your internet connection and try again.';
  return m || 'Something went wrong. Try again.';
}
