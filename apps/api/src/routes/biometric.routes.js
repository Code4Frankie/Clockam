import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { env } from '../config/env.js';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { requireAuth, requireDevice } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { clockUser } from '../services/clock.service.js';
import { toggleBreak } from '../services/break.service.js';
import { applyPunch } from '../services/punch.service.js';
import { acceptOccurredAt } from '../utils/punch.js';
import { asyncHandler, HttpError } from '../utils/http.js';

const router = Router();

// Public kiosk endpoints are rate limited to slow down guessing of staff IDs.
const kioskLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const fromB64 = (str) => new Uint8Array(Buffer.from(str, 'base64url'));

/* ------------------------------------------------------------------ */
/* WebAuthn: phone fingerprint, Windows Hello, FIDO2 USB fingerprint keys */
/* ------------------------------------------------------------------ */

// Step 1 of enrolment (employee must be logged in on the device they are enrolling).
router.post(
  '/webauthn/register/options',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+currentChallenge');
    const options = await generateRegistrationOptions({
      rpName: env.WEBAUTHN_RP_NAME,
      rpID: env.WEBAUTHN_RP_ID,
      userID: new TextEncoder().encode(String(user._id)),
      userName: user.email,
      userDisplayName: user.name,
      attestationType: 'none',
      excludeCredentials: user.webauthnCredentials.map((c) => ({ id: c.credentialId, transports: c.transports })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    });
    user.currentChallenge = options.challenge;
    await user.save();
    res.json(options);
  })
);

// Step 2 of enrolment.
router.post(
  '/webauthn/register/verify',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+currentChallenge');
    if (!user.currentChallenge) throw new HttpError(400, 'No enrolment in progress');

    const verification = await verifyRegistrationResponse({
      response: req.body.response,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: env.WEBAUTHN_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
      requireUserVerification: true,
    }).catch((e) => {
      throw new HttpError(400, `Fingerprint enrolment failed: ${e.message}`);
    });
    if (!verification.verified) throw new HttpError(400, 'Fingerprint enrolment could not be verified');

    const { credential } = verification.registrationInfo;
    user.webauthnCredentials.push({
      credentialId: credential.id,
      publicKey: b64(credential.publicKey),
      counter: credential.counter,
      transports: req.body.response?.response?.transports || [],
      deviceName: req.body.deviceName || 'Unnamed device',
    });
    user.currentChallenge = undefined;
    await user.save();
    res.status(201).json({ message: 'Fingerprint enrolled', credentials: user.webauthnCredentials.length });
  })
);

const identifySchema = z.object({ orgSlug: z.string().min(1), staffId: z.string().min(1) });

async function findKioskUser(orgSlug, staffId) {
  const org = await Organization.findOne({ slug: orgSlug.toLowerCase() });
  const user = org && (await User.findOne({ organization: org._id, staffId, active: true }).select('+currentChallenge'));
  if (!user) throw new HttpError(404, 'Staff ID not found');
  return { org, user };
}

// Kiosk step 1: staff types their ID, we return a fingerprint challenge for their enrolled devices.
router.post(
  '/webauthn/login/options',
  kioskLimiter,
  validate(identifySchema),
  asyncHandler(async (req, res) => {
    const { user } = await findKioskUser(req.body.orgSlug, req.body.staffId);
    if (!user.webauthnCredentials.length) throw new HttpError(400, 'No fingerprint enrolled for this staff ID');

    const options = await generateAuthenticationOptions({
      rpID: env.WEBAUTHN_RP_ID,
      userVerification: 'required',
      allowCredentials: user.webauthnCredentials.map((c) => ({ id: c.credentialId, transports: c.transports })),
    });
    user.currentChallenge = options.challenge;
    await user.save();
    res.json(options);
  })
);

// Kiosk step 2: verify the fingerprint, then clock the person in or out.
router.post(
  '/webauthn/login/verify',
  kioskLimiter,
  validate(identifySchema.extend({ response: z.any(), location: z.object({ lat: z.number(), lng: z.number() }).optional(), intent: z.enum(['clock', 'break']).default('clock') })),
  asyncHandler(async (req, res) => {
    const { org, user } = await findKioskUser(req.body.orgSlug, req.body.staffId);
    const cred = user.webauthnCredentials.find((c) => c.credentialId === req.body.response?.id);
    if (!cred || !user.currentChallenge) throw new HttpError(400, 'Fingerprint not recognised');

    const verification = await verifyAuthenticationResponse({
      response: req.body.response,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: env.WEBAUTHN_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
      credential: {
        id: cred.credentialId,
        publicKey: fromB64(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports,
      },
      requireUserVerification: true,
    }).catch((e) => {
      throw new HttpError(401, `Fingerprint check failed: ${e.message}`);
    });
    if (!verification.verified) throw new HttpError(401, 'Fingerprint check failed');

    cred.counter = verification.authenticationInfo.newCounter;
    user.currentChallenge = undefined;
    await user.save();

    const act = req.body.intent === 'break' ? toggleBreak : clockUser;
    const result = await act({ user, org, method: 'webauthn', location: req.body.location });
    res.json({ ...result, employee: { name: user.name, staffId: user.staffId } });
  })
);

/* ------------------------------------------------------------------ */
/* Hardware scanners (USB / handheld): matching happens on the scanner  */
/* or its local bridge; the API receives the matched scanner user ID.   */
/* ------------------------------------------------------------------ */

router.post(
  '/scanner/clock',
  requireDevice,
  validate(z.object({ scannerUserId: z.string().min(1), occurredAt: z.string().max(40).optional(), intent: z.enum(['clock', 'break']).default('clock') })),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({
      organization: req.device.organization,
      active: true,
      scannerLinks: { $elemMatch: { device: req.device._id, scannerUserId: req.body.scannerUserId } },
    });
    if (!user) throw new HttpError(404, 'This fingerprint is not linked to an employee on this device');

    const org = await Organization.findById(req.device.organization);
    const employee = { name: user.name, staffId: user.staffId };

    if (req.body.intent === 'break') {
      if (req.body.occurredAt) throw new HttpError(400, 'Breaks cannot be saved offline');
      const result = await toggleBreak({ user, org, method: 'scanner' });
      return res.json({ ...result, employee });
    }

    // A kiosk that was offline uploads punches with the time they really happened.
    if (req.body.occurredAt) {
      const at = acceptOccurredAt(req.body.occurredAt);
      if (!at) throw new HttpError(400, 'This saved clock-in is too old or has an invalid time');
      const result = await applyPunch({ user, org, device: req.device, at, method: 'scanner' });
      return res.json({ ...result, employee });
    }

    const result = await clockUser({ user, org, method: 'scanner', device: req.device });
    res.json({ ...result, employee });
  })
);

export default router;
