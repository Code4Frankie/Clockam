import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real calendar date');

export const isoDateTime = z.string().datetime({ offset: true });

// Adds "from <= to" and a maximum span to an object schema that has `from` and `to`.
export const withDateRange = (schema, maxDays = 62) =>
  schema.superRefine((v, ctx) => {
    const from = Date.parse(`${v.from}T00:00:00Z`);
    const to = Date.parse(`${v.to}T00:00:00Z`);
    if (to < from) ctx.addIssue({ code: 'custom', message: '"to" must not be before "from"', path: ['to'] });
    else if ((to - from) / 86400000 > maxDays) {
      ctx.addIssue({ code: 'custom', message: `Range is limited to ${maxDays} days`, path: ['to'] });
    }
  });

export const chatBodySchema = z
  .object({
    messages: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000) }).strict())
      .min(1)
      .max(30),
  })
  .strict()
  .refine((b) => b.messages[0]?.role === 'user', { message: 'The first message must be from the user' })
  .refine((b) => b.messages.at(-1)?.role === 'user', { message: 'The last message must be from the user' });

export const confirmBodySchema = z.object({ confirmationId: objectId, approve: z.boolean().default(true) }).strict();
