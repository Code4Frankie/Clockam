import { User } from '../models/User.js';
import { applyPunch } from './punch.service.js';

/**
 * Applies punches pushed by a ZKTeco unit. People are found through the ID links an admin set up for that device
 * (the "User ID on the scanner" is the PIN the unit uses). Punches for unlinked PINs are counted and skipped.
 */
export async function recordPunches({ device, org, punches }) {
  const result = { recorded: 0, ignored: 0, unlinked: 0 };
  const byPin = new Map();

  for (const { pin, at } of [...punches].sort((a, b) => a.at - b.at)) {
    if (!byPin.has(pin)) {
      byPin.set(pin, await User.findOne({
        organization: org._id,
        active: true,
        scannerLinks: { $elemMatch: { device: device._id, scannerUserId: pin } },
      }).select('_id'));
    }
    const user = byPin.get(pin);
    if (!user) { result.unlinked += 1; continue; }

    const r = await applyPunch({ user, org, device, at, method: 'zkteco' });
    if (r.action === 'ignored') result.ignored += 1;
    else result.recorded += 1;
  }
  return result;
}
