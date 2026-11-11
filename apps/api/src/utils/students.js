import crypto from 'node:crypto';
import { z } from 'zod';
import { hashToken } from './passwordReset.js';

// Matric numbers are compared in capitals, so "csc/2020/001" and "CSC/2020/001" are the same student.
export const normalizeMatric = (s) => String(s ?? '').trim().toUpperCase();

export const matricSchema = z
  .string()
  .transform(normalizeMatric)
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9/._-]{2,31}$/, 'Matric number: 3 to 32 letters, numbers, / . _ -'));

export const importSchema = z
  .object({
    students: z
      .array(z.object({ name: z.string().trim().min(2).max(100), matric: matricSchema, department: z.string().trim().max(100).optional() }).strict())
      .min(1)
      .max(2000),
  })
  .strict();

// Students have no email, but every account needs a unique one. This address can never receive mail (.invalid is reserved).
export const placeholderEmail = (matric) => `${crypto.createHash('sha256').update(matric).digest('hex').slice(0, 20)}@students.clockam.invalid`;

// One-time code that lets a student set up their phone. 8 characters from an alphabet without look-alikes.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newEnrolCode() {
  let s = '';
  for (let i = 0; i < 8; i += 1) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
export const normalizeEnrolCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashEnrolCode = (c) => hashToken(normalizeEnrolCode(c));
export const MAX_ENROL_FAILURES = 5;

// Keeps the first row for each matric number and reports the rest.
export function dedupeStudents(rows) {
  const seen = new Set();
  const unique = [];
  const duplicates = [];
  for (const r of rows) {
    if (seen.has(r.matric)) duplicates.push(r.matric);
    else { seen.add(r.matric); unique.push(r); }
  }
  return { unique, duplicates };
}
