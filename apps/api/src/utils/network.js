import net from 'node:net';
import { HttpError } from './http.js';

// "Allowed networks" are the workplace's public internet addresses: single IPv4 or IPv6 addresses, or IPv4 ranges like 41.58.10.0/24.
export const normalizeIp = (ip) => String(ip || '').replace(/^::ffff:/i, '').trim();

const v4ToInt = (s) => s.split('.').reduce((n, part) => n * 256 + Number(part), 0);

export function isValidNetworkEntry(entry) {
  const s = String(entry || '').trim();
  if (net.isIP(s)) return true;
  const [base, bits] = s.split('/');
  return net.isIPv4(base || '') && /^\d{1,2}$/.test(bits ?? '') && Number(bits) >= 16 && Number(bits) <= 32; // nothing wider than /16
}

export function ipAllowed(ip, entries = []) {
  const addr = normalizeIp(ip);
  if (!net.isIP(addr)) return false;
  return entries.some((raw) => {
    const e = String(raw).trim();
    if (!e.includes('/')) return normalizeIp(e).toLowerCase() === addr.toLowerCase();
    if (!net.isIPv4(addr)) return false;
    const [base, bits] = e.split('/');
    const mask = Number(bits) === 0 ? 0 : (0xffffffff << (32 - Number(bits))) >>> 0;
    return ((v4ToInt(addr) & mask) >>> 0) === ((v4ToInt(base) & mask) >>> 0);
  });
}

// Only for personal phones and laptops. Scanners sit at the workplace, so they are never checked.
export function assertAllowedNetwork(org, ip) {
  const list = org.allowedNetworks || [];
  if (!list.length) return;
  if (!ipAllowed(ip, list)) throw new HttpError(403, 'Connect to the workplace Wi-Fi to clock in. This network is not allowed.');
}
