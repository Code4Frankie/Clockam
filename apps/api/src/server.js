import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { sweepAll } from './services/autoclockout.service.js';

try {
  await connectDB();
  app.listen(env.PORT, () => console.log(`ClockAm API running on port ${env.PORT}`));
  setInterval(() => sweepAll().catch((e) => console.error('auto clock-out sweep failed:', e.message)), 10 * 60 * 1000).unref();
} catch (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
}
