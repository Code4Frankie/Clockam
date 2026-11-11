// Returns the local calendar date (YYYY-MM-DD) and minutes-since-midnight in a given IANA timezone.
export function localParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? 0 : Number(p.hour);
  return { dateKey: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + Number(p.minute) };
}

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const numParts = (date, timeZone) => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: p.hour === '24' ? 0 : +p.hour, mi: +p.minute };
};

// Converts a local wall-clock time (YYYY-MM-DD + HH:mm in an IANA timezone) to a UTC Date.
export function zonedTimeToUtc(dateKey, hhmm, timeZone) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, h, mi);
  let utc = target;
  for (let i = 0; i < 3; i += 1) {
    const p = numParts(new Date(utc), timeZone);
    utc += target - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  }
  return new Date(utc);
}

// "HH:mm" in the given timezone.
export function formatLocal(date, timeZone) {
  if (!date) return null;
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(date));
}

// A local wall-clock time on a given day as a UTC Date, or null if it is not later than `after`.
export function clockoutAfter(dateKey, hhmm, timeZone, after) {
  const d = zonedTimeToUtc(dateKey, hhmm, timeZone);
  return d > after ? d : null;
}
