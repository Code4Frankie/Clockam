import { HttpError } from './http.js';

// Haversine distance in metres between two lat/lng points.
export function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function assertInsideGeofence(org, location) {
  const g = org.geofence;
  if (!g?.enabled) return;
  if (!location) throw new HttpError(400, 'Location is required to clock in at this workplace');
  const dist = distanceMeters({ lat: g.lat, lng: g.lng }, location);
  if (dist > g.radiusMeters) {
    throw new HttpError(403, `You are ${Math.round(dist)}m from the workplace (limit ${g.radiusMeters}m)`);
  }
}


// True when a clock-in was accepted but sat close to the edge of the allowed distance (80% or more), so a manager can look at it.
export function nearLimit(org, location) {
  const g = org.geofence;
  if (!g?.enabled || !location) return false;
  return distanceMeters({ lat: g.lat, lng: g.lng }, location) > g.radiusMeters * 0.8;
}
