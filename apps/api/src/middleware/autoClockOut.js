import { Organization } from '../models/Organization.js';
import { sweepOrg } from '../services/autoclockout.service.js';

// A hosting plan that sleeps cannot run a timer reliably, so each workplace is also swept when someone uses the app
// (at most every 5 minutes per workplace). A failed sweep never blocks the request.
const last = new Map();
const EVERY_MS = 5 * 60 * 1000;

export async function autoClockOutSweep(req, _res, next) {
  try {
    const id = String(req.user.organization);
    if (Date.now() - (last.get(id) || 0) >= EVERY_MS) {
      last.set(id, Date.now());
      await sweepOrg(await Organization.findById(id));
    }
  } catch (e) {
    console.error('auto clock-out sweep failed:', e.message);
  }
  next();
}
