import { localParts, toMinutes } from './time.js';

const MIN_GAP_MS = 60 * 1000;
const OFFLINE_MAX_AGE_MS = 48 * 3600 * 1000;
const OFFLINE_MAX_FUTURE_MS = 5 * 60 * 1000;

// Accepts the time a kiosk recorded while offline, or returns null if it is not believable.
export function acceptOccurredAt(value, now = new Date()) {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  if (at - now > OFFLINE_MAX_FUTURE_MS || now - at > OFFLINE_MAX_AGE_MS) return null;
  return at;
}

/**
 * Decides what one punch means for that person's day. The first punch is the clock-in; any later punch moves the
 * clock-out to that time (the last punch of the day wins). Repeats and double taps are ignored, so resent logs are harmless.
 */
export function decidePunch(existing, at, org) {
  if (!existing) {
    const { minutes } = localParts(at, org.timezone);
    return { action: 'clock-in', status: minutes > toMinutes(org.workStart) + org.graceMinutes ? 'late' : 'present' };
  }
  if (at - existing.clockIn < MIN_GAP_MS) return { action: 'ignore' };
  if (existing.clockOut && at <= existing.clockOut) return { action: 'ignore' };
  return { action: 'clock-out' };
}
