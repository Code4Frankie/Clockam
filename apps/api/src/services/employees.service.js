import { User } from '../models/User.js';
import { HttpError } from '../utils/http.js';
import { escapeRegex } from '../utils/guards.js';

const OBJECT_ID = /^[a-f\d]{24}$/i;

// Safe summary of an employee: counts only, never credentials or scanner links.
export const employeeBrief = (u) => ({
  id: String(u._id),
  name: u.name,
  staffId: u.staffId,
  department: u.department || null,
  role: u.role,
  active: u.active,
  phoneEnrolled: u.webauthnCredentials?.length || 0,
  scannerLinked: u.scannerLinks?.length || 0,
});

// Matches the start of any word in name, staff ID or department. Input is regex-escaped.
export async function findEmployees({ orgId, query, limit = 20 }) {
  const rx = new RegExp(`(^|\\s)${escapeRegex(query)}`, 'i');
  const users = await User.find({ organization: orgId, $or: [{ name: rx }, { staffId: rx }, { department: rx }] })
    .select('name staffId department role active webauthnCredentials scannerLinks')
    .sort({ name: 1 })
    .limit(limit);
  return users.map(employeeBrief);
}

export async function getEmployee({ orgId, userId }) {
  if (!OBJECT_ID.test(String(userId))) return null;
  return User.findOne({ _id: userId, organization: orgId }).select('name staffId department role active webauthnCredentials scannerLinks');
}

export async function setEmployeeActive({ orgId, userId, active }) {
  const user = await User.findOneAndUpdate({ _id: userId, organization: orgId }, { active }, { new: true });
  if (!user) throw new HttpError(404, 'Employee not found');
  return user;
}

export async function clearFingerprints({ orgId, userId }) {
  const user = await User.findOneAndUpdate(
    { _id: userId, organization: orgId },
    { webauthnCredentials: [], scannerLinks: [] },
    { new: true }
  );
  if (!user) throw new HttpError(404, 'Employee not found');
  return user;
}

// Stricter than the REST routes: the assistant may not act on the owner, on itself, or (unless owner) on admins.
export function assertCanManage(actor, target) {
  if (String(target._id) === String(actor._id)) throw new HttpError(400, 'This action cannot be done to your own account');
  if (target.role === 'owner') throw new HttpError(403, 'The owner account cannot be changed this way');
  if (target.role === 'admin' && actor.role !== 'owner') throw new HttpError(403, 'Only the owner can change an admin');
}
