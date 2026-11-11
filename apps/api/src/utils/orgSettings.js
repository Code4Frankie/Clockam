import { z } from 'zod';
import { toMinutes } from './time.js';
import { isValidNetworkEntry } from './network.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time like 08:30');

const validZone = (tz) => {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// Work hours and location rules an owner or admin can change. Unknown fields are rejected.
export const settingsSchema = z
  .object({
    type: z.enum(['workplace', 'school', 'government']).optional(),
    requireSelfie: z.boolean().optional(),
    timezone: z.string().refine(validZone, 'Unknown time zone').optional(),
    workStart: hhmm.optional(),
    workEnd: hhmm.optional(),
    graceMinutes: z.number().int().min(0).max(180).optional(),
    autoClockOutHours: z.number().int().min(0).max(12).optional(), // 0 turns it off
    allowedNetworks: z.array(z.string().trim().refine(isValidNetworkEntry, 'Use an IP address like 41.58.10.7 or a range like 41.58.10.0/24')).max(10).optional(),
    geofence: z
      .object({
        enabled: z.boolean(),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        radiusMeters: z.number().int().min(20).max(5000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

// Checks the settings as they will be after the change, so a partial update cannot leave a broken combination.
export function checkMerged(merged) {
  if (toMinutes(merged.workEnd) <= toMinutes(merged.workStart)) return 'Closing time must be after start time';
  const g = merged.geofence;
  if (g?.enabled && (typeof g.lat !== 'number' || typeof g.lng !== 'number')) {
    return 'Set the workplace location before turning on the location check';
  }
  return null;
}

// Applies validated changes to a plain settings object and returns the merged copy.
export function mergeSettings(current, patch) {
  const merged = {
    type: current.type ?? 'workplace',
    requireSelfie: current.requireSelfie ?? true,
    timezone: current.timezone,
    workStart: current.workStart,
    workEnd: current.workEnd,
    graceMinutes: current.graceMinutes,
    autoClockOutHours: current.autoClockOutHours ?? 0,
    allowedNetworks: [...(current.allowedNetworks || [])],
    geofence: {
      enabled: !!current.geofence?.enabled,
      lat: current.geofence?.lat,
      lng: current.geofence?.lng,
      radiusMeters: current.geofence?.radiusMeters ?? 150,
    },
  };
  for (const k of ['type', 'requireSelfie', 'timezone', 'workStart', 'workEnd', 'graceMinutes', 'autoClockOutHours', 'allowedNetworks']) if (patch[k] !== undefined) merged[k] = patch[k];
  if (patch.geofence) merged.geofence = { ...merged.geofence, ...patch.geofence };
  return merged;
}
