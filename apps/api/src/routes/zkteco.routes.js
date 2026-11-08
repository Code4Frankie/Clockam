import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { Device } from '../models/Device.js';
import { Organization } from '../models/Organization.js';
import { recordPunches } from '../services/zkteco.service.js';
import { asyncHandler } from '../utils/http.js';
import { SERIAL, handshakeText, parseAttLog } from '../utils/zkteco.js';

const router = Router();
const text = (res, status, body) => res.status(status).type('text/plain').send(body);

// Off unless you turn it on: these endpoints cannot use a password, only the unit's serial number.
router.use((req, res, next) => (env.ZKTECO_PUSH_ENABLED === 'true' ? next() : text(res, 404, 'Not found')));
router.use(rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }));
router.use(express.text({ type: () => true, limit: '256kb' }));

// Only a unit that an admin registered (and has not switched off) may talk to us.
const knownUnit = asyncHandler(async (req, res, next) => {
  const sn = String(req.query.SN || '');
  const device = SERIAL.test(sn) && (await Device.findOne({ serialNumber: sn, type: 'zkteco', active: true }));
  if (!device) return text(res, 403, 'Unknown device');
  device.lastSeenAt = new Date();
  await device.save();
  req.unit = device;
  next();
});

// The unit introduces itself here, and sends its punches here.
router.get('/cdata', knownUnit, (req, res) => text(res, 200, handshakeText(req.unit.serialNumber)));

router.post(
  '/cdata',
  knownUnit,
  asyncHandler(async (req, res) => {
    if (req.query.table === 'ATTLOG') {
      const org = await Organization.findById(req.unit.organization);
      const { punches } = parseAttLog(typeof req.body === 'string' ? req.body : '', org.timezone);
      await recordPunches({ device: req.unit, org, punches });
    }
    text(res, 200, 'OK'); // always answer OK, otherwise the unit keeps resending the same batch
  })
);

// Heartbeat, and the unit reporting the result of a command we never sent.
router.get('/getrequest', knownUnit, (_req, res) => text(res, 200, 'OK'));
router.post('/devicecmd', knownUnit, (_req, res) => text(res, 200, 'OK'));

export default router;
