import http from 'node:http';
import crypto from 'node:crypto';

const MAX_BODY = 4096;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * The bridge is a tiny local web service. Only the kiosk origins you list may call it from a browser,
 * and enrolment needs the admin token, so a random web page cannot read or change anything.
 */
export function createBridge({ adapter, allowedOrigins = [], adminToken = '' }) {
  const allowed = new Set(allowedOrigins);

  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };

    if (origin) {
      if (!allowed.has(origin)) return send(403, { message: 'This website is not allowed to use the scanner bridge' });
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, x-bridge-admin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    try {
      const url = new URL(req.url, 'http://local');

      if (req.method === 'GET' && url.pathname === '/health') {
        return send(200, { ok: true, adapter: adapter.name, ready: await adapter.isReady() });
      }

      if (req.method === 'POST' && url.pathname === '/identify') {
        const scannerUserId = await adapter.identify();
        if (!scannerUserId) return send(404, { message: 'Finger not recognised' });
        return send(200, { scannerUserId: String(scannerUserId) });
      }

      const isAdmin = safeEqual(req.headers['x-bridge-admin'], adminToken) && adminToken.length >= 8;

      if (req.method === 'POST' && url.pathname === '/enroll') {
        if (!isAdmin) return send(401, { message: 'Admin token required' });
        const { scannerUserId } = await readJson(req);
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(String(scannerUserId || ''))) return send(400, { message: 'scannerUserId must be 1-32 letters, numbers, - or _, starting with a letter or number' });
        await adapter.enroll(String(scannerUserId));
        return send(201, { scannerUserId: String(scannerUserId) });
      }

      if (req.method === 'DELETE' && url.pathname.startsWith('/enroll/')) {
        if (!isAdmin) return send(401, { message: 'Admin token required' });
        const id = decodeURIComponent(url.pathname.slice('/enroll/'.length));
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(id)) return send(400, { message: 'Invalid scanner user ID' });
        return send(200, { removed: await adapter.remove(id) });
      }

      return send(404, { message: 'Not found' });
    } catch (e) {
      const status = e.status || 502;
      return send(status, { message: status === 502 ? `Scanner error: ${e.message}` : e.message });
    }
  });
}
