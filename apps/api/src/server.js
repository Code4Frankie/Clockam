import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';

try {
  await connectDB();
  app.listen(env.PORT, () => console.log(`ClockAm API running on port ${env.PORT}`));
} catch (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
}
