import { Organization } from '../models/Organization.js';
import { HttpError } from '../utils/http.js';
import { SUSPENDED_MESSAGE } from '../utils/suspension.js';

// Checked on every signed-in request, so the answer is remembered for a few seconds instead of asking the database each time.
const TTL_MS = 10 * 1000;
const cache = new Map();
export const clearSuspensionCache = () => cache.clear();

export async function isSuspended(orgId) {
  const key = String(orgId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const org = await Organization.findById(orgId).select('suspended').lean();
  const value = !!org?.suspended?.at;
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function assertNotSuspended(orgId) {
  if (await isSuspended(orgId)) throw new HttpError(403, SUSPENDED_MESSAGE);
}
