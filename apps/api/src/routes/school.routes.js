import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
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
import { ClassSession } from '../models/ClassSession.js';
import { ClassAttendance } from '../models/ClassAttendance.js';
import { ClassSelfie } from '../models/ClassSelfie.js';
import { Course } from '../models/Course.js';
import { parseSelfie } from '../utils/selfie.js';
import { splitPresent } from '../utils/roster.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { billingGate } from '../middleware/billing.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import { assertInsideGeofence, nearLimit } from '../utils/geo.js';
import { assertAllowedNetwork } from '../utils/network.js';
import { formatLocal } from '../utils/time.js';
import { csvLine } from '../utils/csv.js';
import { courseScope, sessionScope } from '../utils/scope.js';
import { currentCode, codeValid, newSessionSecret } from '../utils/classCode.js';
import {
  importSchema, matricSchema, normalizeMatric, placeholderEmail, newEnrolCode, hashEnrolCode,
  dedupeStudents, MAX_ENROL_FAILURES,
} from '../utils/students.js';

const router = Router();

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const fromB64 = (str) => new Uint8Array(Buffer.from(str, 'base64url'));
const ENROL_DAYS = 14;
const MAX_DEVICES = 2;

// Many students share the campus Wi-Fi (one public IP), so the attendance limit is generous. Enrolment is stricter.
const enrolLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
const attendLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });

const staffOnly = [requireAuth, requireRole('owner', 'admin', 'manager')];
const adminOnly = [requireAuth, requireRole('owner', 'admin')];
const validId = (id) => mongoose.isValidObjectId(id);

async function schoolBySlug(slug) {
  const org = await Organization.findOne({ slug: String(slug).toLowerCase() });
  if (!org || org.type !== 'school') throw new HttpError(404, 'School not found');
  return org;
}

/* ------------------------------ Student list (admin) ------------------------------ */

router.get('/students', ...adminOnly, asyncHandler(async (req, res) => {
  const rows = await User.find({ organization: req.user.organization, role: 'student' })
    .select('name staffId department active webauthnCredentials.credentialId')
    .sort({ name: 1 });
  res.json(rows.map((u) => ({ id: u._id, name: u.name, matric: u.staffId, department: u.department, active: u.active, devices: u.webauthnCredentials.length })));
}));

// Adds students from an uploaded list. Each gets a one-time code to set up their phone. The codes are shown once.
router.post('/students/import', ...adminOnly, billingGate, validate(importSchema), asyncHandler(async (req, res) => {
  const orgId = req.user.organization;
  const { unique, duplicates } = dedupeStudents(req.body.students);
  const existing = await User.find({ organization: orgId, staffId: { $in: unique.map((s) => s.matric) } }).select('staffId role');
  const taken = new Map(existing.map((u) => [u.staffId, u.role]));

  const skipped = duplicates.map((m) => ({ matric: m, reason: 'Listed twice in the file' }));
  const fresh = [];
  for (const s of unique) {
    if (taken.has(s.matric)) skipped.push({ matric: s.matric, reason: taken.get(s.matric) === 'student' ? 'Already on the student list' : 'Used by a staff account' });
    else fresh.push(s);
  }

  // Students never sign in with a password, so they all share one hash of a random value nobody knows.
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
  const expires = new Date(Date.now() + ENROL_DAYS * 24 * 3600 * 1000);
  const codes = [];
  const docs = fresh.map((s) => {
    const code = newEnrolCode();
    codes.push({ name: s.name, matric: s.matric, code });
    return {
      organization: orgId, name: s.name, staffId: s.matric, department: s.department, role: 'student',
      email: placeholderEmail(s.matric), passwordHash, enrolCodeHash: hashEnrolCode(code), enrolCodeExpires: expires,
    };
  });
  if (docs.length) await User.insertMany(docs);
  res.status(201).json({ added: codes.length, skipped, codes, codesValidDays: ENROL_DAYS });
}));

router.post('/students/:id/enrol-code', ...adminOnly, asyncHandler(async (req, res) => {
  const code = newEnrolCode();
  const user = validId(req.params.id) && await User.findOneAndUpdate(
    { _id: req.params.id, organization: req.user.organization, role: 'student' },
    { enrolCodeHash: hashEnrolCode(code), enrolCodeExpires: new Date(Date.now() + ENROL_DAYS * 24 * 3600 * 1000), enrolFailures: 0 },
    { new: true }
  );
  if (!user) throw new HttpError(404, 'Student not found');
  res.json({ name: user.name, matric: user.staffId, code, codesValidDays: ENROL_DAYS });
}));

router.patch('/students/:id', ...adminOnly, validate(z.object({ active: z.boolean() }).strict()), asyncHandler(async (req, res) => {
  const user = validId(req.params.id) && await User.findOneAndUpdate({ _id: req.params.id, organization: req.user.organization, role: 'student' }, { active: req.body.active }, { new: true });
  if (!user) throw new HttpError(404, 'Student not found');
  res.json({ id: user._id, active: user.active });
}));

/* ------------------------------ Phone set-up (public) ------------------------------ */

const enrolSchema = z.object({ orgSlug: z.string().min(1).max(80), matric: matricSchema, code: z.string().min(4).max(20) });
const BAD_ENROL = 'Matric number or set-up code is not right. Ask your school for a new code if it has expired.';

async function studentForEnrol(body) {
  const org = await schoolBySlug(body.orgSlug);
  const user = await User.findOne({ organization: org._id, staffId: body.matric, role: 'student', active: true })
    .select('+enrolCodeHash +enrolCodeExpires +enrolFailures +currentChallenge');
  if (!user || !user.enrolCodeHash || !user.enrolCodeExpires || user.enrolCodeExpires < new Date() || (user.enrolFailures || 0) >= MAX_ENROL_FAILURES) {
    throw new HttpError(400, BAD_ENROL);
  }
  const want = Buffer.from(user.enrolCodeHash);
  const got = Buffer.from(hashEnrolCode(body.code));
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
    user.enrolFailures = (user.enrolFailures || 0) + 1;
    await user.save();
    throw new HttpError(400, BAD_ENROL);
  }
  if (user.webauthnCredentials.length >= MAX_DEVICES) throw new HttpError(400, `This student already has ${MAX_DEVICES} phones set up. Ask the school to reset them.`);
  return { org, user };
}

router.post('/enrol/options', enrolLimiter, validate(enrolSchema), asyncHandler(async (req, res) => {
  const { user } = await studentForEnrol(req.body);
  const options = await generateRegistrationOptions({
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: env.WEBAUTHN_RP_ID,
    userID: new TextEncoder().encode(String(user._id)),
    userName: user.staffId,
    userDisplayName: user.name,
    attestationType: 'none',
    excludeCredentials: user.webauthnCredentials.map((c) => ({ id: c.credentialId, transports: c.transports })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  user.currentChallenge = options.challenge;
  await user.save();
  res.json(options);
}));

router.post('/enrol/verify', enrolLimiter, validate(enrolSchema.extend({ response: z.any(), deviceName: z.string().max(60).optional() })), asyncHandler(async (req, res) => {
  const { user } = await studentForEnrol(req.body);
  if (!user.currentChallenge) throw new HttpError(400, 'Start again: no set-up in progress');
  const verification = await verifyRegistrationResponse({
    response: req.body.response,
    expectedChallenge: user.currentChallenge,
    expectedOrigin: env.WEBAUTHN_ORIGIN,
    expectedRPID: env.WEBAUTHN_RP_ID,
    requireUserVerification: true,
  }).catch((e) => { throw new HttpError(400, `Phone set-up failed: ${e.message}`); });
  if (!verification.verified) throw new HttpError(400, 'Phone set-up could not be verified');

  const { credential } = verification.registrationInfo;
  user.webauthnCredentials.push({
    credentialId: credential.id,
    publicKey: b64(credential.publicKey),
    counter: credential.counter,
    transports: req.body.response?.response?.transports || [],
    deviceName: req.body.deviceName || 'Phone',
  });
  // The code works once. A second phone needs a new code from the school.
  user.currentChallenge = undefined;
  user.enrolCodeHash = undefined;
  user.enrolCodeExpires = undefined;
  user.enrolFailures = 0;
  await user.save();
  res.status(201).json({ message: 'Phone set up', name: user.name });
}));

/* ------------------------------ Classes (lecturers) ------------------------------ */

const startSchema = z.object({ title: z.string().trim().min(2).max(120), minutes: z.number().int().min(10).max(480).default(120), courseId: z.string().max(40).optional() }).strict();
const isLive = (s, now = new Date()) => !s.endedAt && s.endsAt > now;

async function ownSession(req, withSecret = false) {
  const q = validId(req.params.id) && ClassSession.findOne({ _id: req.params.id, organization: req.user.organization, ...sessionScope(req.user) });
  const s = q && (await (withSecret ? q.select('+secret') : q));
  if (!s) throw new HttpError(404, 'Class not found');
  return s;
}

router.post('/sessions', ...staffOnly, billingGate, validate(startSchema), asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.user.organization);
  if (org.type !== 'school') throw new HttpError(400, 'Classes are only available for schools. Change the type in Settings.');
  let course;
  if (req.body.courseId) {
    course = validId(req.body.courseId) && await Course.findOne({ _id: req.body.courseId, organization: org._id, ...courseScope(req.user) });
    if (!course) throw new HttpError(404, 'Course not found');
  }
  const s = await ClassSession.create({
    organization: org._id, course: course?._id, title: req.body.title, startedBy: req.user._id, secret: newSessionSecret(),
    endsAt: new Date(Date.now() + req.body.minutes * 60 * 1000),
  });
  res.status(201).json({ id: s._id, title: s.title, endsAt: s.endsAt });
}));

router.get('/sessions', ...staffOnly, asyncHandler(async (req, res) => {
  const list = await ClassSession.find({ organization: req.user.organization, ...sessionScope(req.user) }).sort({ startedAt: -1 }).limit(50).populate('startedBy', 'name');
  const counts = await ClassAttendance.aggregate([
    { $match: { session: { $in: list.map((s) => s._id) } } },
    { $group: { _id: '$session', n: { $sum: 1 } } },
  ]);
  const by = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json(list.map((s) => ({ id: s._id, title: s.title, lecturer: s.startedBy?.name, startedAt: s.startedAt, endsAt: s.endsAt, live: isLive(s), present: by.get(String(s._id)) || 0 })));
}));

router.post('/sessions/:id/end', ...staffOnly, asyncHandler(async (req, res) => {
  const s = await ownSession(req);
  if (!s.endedAt) { s.endedAt = new Date(); await s.save(); }
  res.json({ id: s._id, endedAt: s.endedAt });
}));

// Polled every few seconds by the screen in the classroom. Returns the live code and the number present, never names.
router.get('/sessions/:id/display', ...staffOnly, asyncHandler(async (req, res) => {
  const s = await ownSession(req, true);
  const org = await Organization.findById(s.organization).select('slug');
  const present = await ClassAttendance.countDocuments({ session: s._id });
  const live = isLive(s);
  const base = { title: s.title, live, endsAt: s.endsAt, present };
  if (!live) return res.json(base);
  const { code, expiresInMs } = currentCode(s.secret);
  res.json({ ...base, code, expiresInMs, url: `${env.webAppUrl}/attend/${s._id}?c=${code}`, orgSlug: org.slug });
}));

// Present list, and for a class linked to a course, who on the course list is absent.
async function classRegister(s) {
  const [marks, selfies] = await Promise.all([
    ClassAttendance.find({ session: s._id }).sort({ at: 1 }).populate('student', 'name staffId'),
    ClassSelfie.find({ session: s._id }).select('student'),
  ]);
  const withSelfie = new Set(selfies.map((x) => String(x.student)));
  const present = marks.map((r) => ({ id: r.student?._id, name: r.student?.name, matric: r.student?.staffId, at: r.at, flags: r.flags, hasSelfie: withSelfie.has(String(r.student?._id)) }));
  let absent = [];
  if (s.course) {
    const course = await Course.findOne({ _id: s.course, organization: s.organization }).populate('students', 'name staffId');
    const roster = (course?.students || []).map((u) => ({ id: u._id, name: u.name, matric: u.staffId }));
    absent = splitPresent(roster, marks.map((m) => m.student?._id)).absent;
  }
  return { present, absent };
}

router.get('/sessions/:id/attendance', ...staffOnly, asyncHandler(async (req, res) => {
  const s = await ownSession(req);
  const { present, absent } = await classRegister(s);
  res.json({ title: s.title, live: isLive(s), hasCourse: !!s.course, present, absent });
}));

router.get('/sessions/:id/selfie/:studentId', ...staffOnly, asyncHandler(async (req, res) => {
  const s = await ownSession(req);
  const pic = validId(req.params.studentId) && await ClassSelfie.findOne({ session: s._id, student: req.params.studentId, organization: s.organization }).select('+image');
  if (!pic) throw new HttpError(404, 'No selfie');
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(pic.image);
}));

router.get('/sessions/:id/export.csv', ...staffOnly, asyncHandler(async (req, res) => {
  const s = await ownSession(req);
  const org = await Organization.findById(s.organization).select('timezone');
  const { present, absent } = await classRegister(s);
  const lines = [csvLine(['Name', 'Matric number', 'Status', 'Time marked', 'Flags']),
    ...present.map((r) => csvLine([r.name, r.matric, 'Present', formatLocal(r.at, org.timezone), (r.flags || []).join(' ')])),
    ...absent.map((r) => csvLine([r.name, r.matric, 'Absent', '', '']))];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="class-attendance.csv"');
  res.send(lines.join('\n'));
}));

/* ------------------------------ Marking attendance (public) ------------------------------ */

router.get('/public/session/:id', attendLimiter, asyncHandler(async (req, res) => {
  const s = validId(req.params.id) && await ClassSession.findById(req.params.id);
  if (!s) throw new HttpError(404, 'Class not found');
  const org = await Organization.findById(s.organization).select('name slug');
  res.json({ title: s.title, school: org.name, orgSlug: org.slug, live: isLive(s), requireSelfie: org.requireSelfie !== false });
}));

const attendSchema = z.object({ sessionId: z.string().min(1).max(40), matric: matricSchema, code: z.string().regex(/^\d{6}$/, 'Enter the 6 digits shown in class') });
const BAD_ATTEND = 'Could not check you in. Check your matric number and the code, and make sure your phone is set up.';

async function attendContext(body) {
  const s = validId(body.sessionId) && await ClassSession.findById(body.sessionId).select('+secret');
  if (!s) throw new HttpError(404, 'Class not found');
  if (!isLive(s)) throw new HttpError(400, 'This class has ended');
  if (!codeValid(s.secret, body.code)) throw new HttpError(400, 'That code has expired. Use the code now showing on the screen.');
  const org = await Organization.findById(s.organization);
  const user = await User.findOne({ organization: s.organization, staffId: body.matric, role: 'student', active: true }).select('+currentChallenge');
  if (!user || !user.webauthnCredentials.length) throw new HttpError(400, BAD_ATTEND);
  return { s, org, user };
}

router.post('/attend/options', attendLimiter, validate(attendSchema), asyncHandler(async (req, res) => {
  const { user } = await attendContext(req.body);
  const options = await generateAuthenticationOptions({
    rpID: env.WEBAUTHN_RP_ID,
    userVerification: 'required',
    allowCredentials: user.webauthnCredentials.map((c) => ({ id: c.credentialId, transports: c.transports })),
  });
  user.currentChallenge = options.challenge;
  await user.save();
  res.json(options);
}));

router.post('/attend/verify', attendLimiter, validate(attendSchema.extend({ response: z.any(), location: z.object({ lat: z.number(), lng: z.number() }).optional(), selfie: z.string().max(200000).optional() })), asyncHandler(async (req, res) => {
  const { s, org, user } = await attendContext(req.body);
  if (org.requireSelfie !== false && !req.body.selfie) throw new HttpError(400, 'A selfie is needed to mark attendance');
  const selfie = req.body.selfie ? parseSelfie(req.body.selfie) : null;
  const cred = user.webauthnCredentials.find((c) => c.credentialId === req.body.response?.id);
  if (!cred || !user.currentChallenge) throw new HttpError(400, BAD_ATTEND);

  // Place and network rules are the school's own settings (campus location, campus Wi-Fi).
  assertInsideGeofence(org, req.body.location);
  assertAllowedNetwork(org, req.ip);

  const verification = await verifyAuthenticationResponse({
    response: req.body.response,
    expectedChallenge: user.currentChallenge,
    expectedOrigin: env.WEBAUTHN_ORIGIN,
    expectedRPID: env.WEBAUTHN_RP_ID,
    credential: { id: cred.credentialId, publicKey: fromB64(cred.publicKey), counter: cred.counter, transports: cred.transports },
    requireUserVerification: true,
  }).catch((e) => { throw new HttpError(401, `Face or fingerprint check failed: ${e.message}`); });
  if (!verification.verified) throw new HttpError(401, 'Face or fingerprint check failed');

  cred.counter = verification.authenticationInfo.newCounter;
  user.currentChallenge = undefined;
  await user.save();

  const flags = nearLimit(org, req.body.location) ? ['near-limit'] : [];
  if (s.course && !(await Course.exists({ _id: s.course, students: user._id }))) flags.push('not-on-course-list');
  try {
    await ClassAttendance.create({ organization: org._id, session: s._id, student: user._id, location: req.body.location, flags });
    if (selfie) await ClassSelfie.updateOne({ session: s._id, student: user._id }, { $setOnInsert: { organization: org._id, image: selfie, createdAt: new Date() } }, { upsert: true });
  } catch (e) {
    if (e?.code === 11000) return res.json({ alreadyRecorded: true, name: user.name, matric: user.staffId, title: s.title });
    throw e;
  }
  res.status(201).json({ alreadyRecorded: false, name: user.name, matric: user.staffId, title: s.title });
}));

export default router;
