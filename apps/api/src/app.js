import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.routes.js';
import employeeRoutes from './routes/employees.routes.js';
import deviceRoutes from './routes/devices.routes.js';
import biometricRoutes from './routes/biometric.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import reportRoutes from './routes/reports.routes.js';
import zktecoRoutes from './routes/zkteco.routes.js';
import organizationRoutes from './routes/organization.routes.js';
import agentRoutes from './routes/agent.routes.js';
import seoRoutes from './routes/seo.routes.js';

const app = express();

app.set('trust proxy', 1); // behind Render/Railway proxies
app.use(helmet());
app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
if (env.NODE_ENV !== 'test') app.use(morgan('dev'));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));

// Public, non-secret deployment info. The site auditor compares it with the web hostname.
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'ClockAm API', webauthnRpId: env.WEBAUTHN_RP_ID, webauthnOrigin: env.WEBAUTHN_ORIGIN })
);

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/biometric', biometricRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/organization', organizationRoutes);
app.use('/iclock', zktecoRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/admin/seo', seoRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
