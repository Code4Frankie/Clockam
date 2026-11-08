import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time like 08:30');

// What an admin sends from the Edit attendance screen. The reason is required so every change can be explained later.
export const editDaySchema = z
  .object({
    userId: z.string().regex(/^[a-f\d]{24}$/i, 'Choose an employee'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
    clockIn: hhmm,
    clockOut: hhmm.nullable().optional(),
    reason: z.string().trim().min(3, 'Say why you are changing this').max(200),
  })
  .strict();
