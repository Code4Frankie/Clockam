import { createBridge } from './server.js';
import { loadAdapter } from './adapters/index.js';

const port = Number(process.env.BRIDGE_PORT || 8123);
const origins = (process.env.BRIDGE_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const adminToken = process.env.BRIDGE_ADMIN_TOKEN || '';

if (!origins.length) {
  console.error('Set BRIDGE_ALLOWED_ORIGINS to your kiosk website, e.g. https://clockam.vercel.app');
  process.exit(1);
}
if (adminToken.length < 8) console.warn('BRIDGE_ADMIN_TOKEN is missing or too short: enrolment is disabled.');

const adapter = loadAdapter(process.env.BRIDGE_ADAPTER || 'simulator');
// Listens on this PC only, never on the network.
createBridge({ adapter, allowedOrigins: origins, adminToken }).listen(port, '127.0.0.1', () => {
  console.log(`ClockAm scanner bridge on http://127.0.0.1:${port} using the "${adapter.name}" driver`);
});
