import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Course } from '../models/Course.js';
import { User } from '../models/User.js';
import { ClassSession } from '../models/ClassSession.js';
import { ClassAttendance } from '../models/ClassAttendance.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { billingGate } from '../middleware/billing.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import { csvLine } from '../utils/csv.js';
import { parseMatrics, courseReport } from '../utils/roster.js';
import { courseScope } from '../utils/scope.js';

const router = Router();
router.use(requireAuth, requireRole('owner', 'admin', 'manager'), billingGate);

async function own(req) {
  const c = mongoose.isValidObjectId(req.params.id) && await Course.findOne({ _id: req.params.id, organization: req.user.organization, ...courseScope(req.user) });
  if (!c) throw new HttpError(404, 'Course not found');
  return c;
}

router.get('/', asyncHandler(async (req, res) => {
  const list = await Course.find({ organization: req.user.organization, ...courseScope(req.user) }).sort({ code: 1 });
  const held = await ClassSession.aggregate([{ $match: { course: { $in: list.map((c) => c._id) } } }, { $group: { _id: '$course', n: { $sum: 1 } } }]);
  const by = new Map(held.map((h) => [String(h._id), h.n]));
  res.json(list.map((c) => ({ id: c._id, code: c.code, title: c.title, students: c.students.length, classes: by.get(String(c._id)) || 0 })));
}));

router.post('/', validate(z.object({ code: z.string().trim().min(2).max(20), title: z.string().trim().min(2).max(120) }).strict()), asyncHandler(async (req, res) => {
  try {
    const c = await Course.create({ organization: req.user.organization, createdBy: req.user._id, ...req.body });
    res.status(201).json({ id: c._id, code: c.code, title: c.title });
  } catch (e) {
    if (e?.code === 11000) throw new HttpError(409, 'A course with this code already exists');
    throw e;
  }
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const c = await (await own(req)).populate('students', 'name staffId');
  res.json({ id: c._id, code: c.code, title: c.title, students: c.students.map((u) => ({ id: u._id, name: u.name, matric: u.staffId })).sort((a, b) => a.name.localeCompare(b.name)) });
}));

// Replaces the course list with the matric numbers sent. Numbers that are not on the school's student list are reported back.
router.put('/:id/students', validate(z.object({ text: z.string().max(100000) }).strict()), asyncHandler(async (req, res) => {
  const c = await own(req);
  const { matrics, invalid } = parseMatrics(req.body.text);
  if (matrics.length > 2000) throw new HttpError(400, 'At most 2000 students per course');
  const found = await User.find({ organization: req.user.organization, role: 'student', staffId: { $in: matrics } }).select('staffId');
  const ok = new Set(found.map((u) => u.staffId));
  c.students = found.map((u) => u._id);
  await c.save();
  res.json({ count: found.length, unknown: matrics.filter((m) => !ok.has(m)), invalid });
}));

router.delete('/:id', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const c = await own(req);
  await ClassSession.updateMany({ course: c._id }, { $unset: { course: 1 } });
  await c.deleteOne();
  res.json({ message: 'Course removed. Its past classes are kept.' });
}));

async function buildReport(c) {
  await c.populate('students', 'name staffId');
  const roster = c.students.map((u) => ({ id: u._id, name: u.name, matric: u.staffId })).sort((a, b) => a.name.localeCompare(b.name));
  const sessions = await ClassSession.find({ course: c._id }).select('_id');
  const counts = await ClassAttendance.aggregate([{ $match: { session: { $in: sessions.map((s) => s._id) } } }, { $group: { _id: '$student', n: { $sum: 1 } } }]);
  return { held: sessions.length, rows: courseReport(roster, sessions.length, new Map(counts.map((x) => [String(x._id), x.n]))) };
}

router.get('/:id/report', asyncHandler(async (req, res) => {
  const c = await own(req);
  const r = await buildReport(c);
  res.json({ code: c.code, title: c.title, ...r });
}));

router.get('/:id/report.csv', asyncHandler(async (req, res) => {
  const c = await own(req);
  const { held, rows } = await buildReport(c);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${c.code.replace(/[^A-Z0-9]/g, '')}-attendance.csv"`);
  res.send([csvLine(['Name', 'Matric number', 'Classes attended', 'Classes held', 'Percent']), ...rows.map((r) => csvLine([r.name, r.matric, r.attended, held, `${r.percent}%`]))].join('\n'));
}));

export default router;
