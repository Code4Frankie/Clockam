import { z } from 'zod';
import { defineTool, ADMIN } from '../defineTool.js';
import { dateStr, isoDateTime, objectId } from '../schemas.js';
import { HttpError } from '../../utils/http.js';
import { formatLocal, localParts } from '../../utils/time.js';

const input = z
  .object({
    userId: objectId,
    date: dateStr,
    clockIn: isoDateTime,
    clockOut: isoDateTime.optional(),
    status: z.enum(['present', 'late', 'leave']).default('present'),
    note: z.string().trim().max(200).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.clockOut && Date.parse(v.clockOut) <= Date.parse(v.clockIn)) {
      ctx.addIssue({ code: 'custom', message: 'clockOut must be after clockIn', path: ['clockOut'] });
    }
  });

// Shared by summarize() and run(): checks the target and the date before anything is shown or written.
async function check(ctx, v) {
  const [employees, attendance] = await Promise.all([
    import('../../services/employees.service.js'),
    import('../../services/attendance.service.js'),
  ]);
  const emp = await employees.getEmployee({ orgId: ctx.user.organization, userId: v.userId });
  if (!emp) throw new HttpError(404, 'Employee not found');
  if (v.date > attendance.todayKey(ctx.org)) throw new HttpError(400, 'Corrections cannot be made for future dates');
  if (localParts(new Date(v.clockIn), ctx.org.timezone).dateKey !== v.date) {
    throw new HttpError(400, 'The clock-in time is not on that date (workplace local time)');
  }
  return { emp, attendance };
}

export default defineTool({
  name: 'propose_attendance_correction',
  label: 'Preparing an attendance correction…',
  description:
    'Propose fixing or adding one day of attendance for an employee (for example a missing clock-out). Times are ISO 8601 with offset, e.g. 2026-11-03T17:00:00+01:00. Needs the user to confirm. Never use this to clock someone in as if they scanned.',
  roles: ADMIN,
  confirm: true,
  input,
  jsonSchema: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'Employee id from find_employee' },
      date: { type: 'string', description: 'YYYY-MM-DD, workplace local date' },
      clockIn: { type: 'string', description: 'ISO 8601 with offset' },
      clockOut: { type: 'string', description: 'ISO 8601 with offset (optional)' },
      status: { type: 'string', enum: ['present', 'late', 'leave'] },
      note: { type: 'string', description: 'Short reason, max 200 characters' },
    },
    required: ['userId', 'date', 'clockIn'],
    additionalProperties: false,
  },
  async summarize(ctx, v) {
    const { emp, attendance } = await check(ctx, v);
    const tz = ctx.org.timezone;
    const before = await attendance.getExistingRecord({ orgId: ctx.user.organization, userId: v.userId, date: v.date });
    const was = before
      ? `Currently: in ${formatLocal(before.clockIn, tz)}, out ${formatLocal(before.clockOut, tz) ?? 'none'}, ${before.status}.`
      : 'There is no record for that day yet.';
    return {
      text: `Set ${emp.name} (${emp.staffId}) on ${v.date}: clock-in ${formatLocal(v.clockIn, tz)}, clock-out ${v.clockOut ? formatLocal(v.clockOut, tz) : 'none'}, status ${v.status}. ${was}`,
      employee: emp.name,
    };
  },
  async run(ctx, v) {
    const { emp, attendance } = await check(ctx, v);
    await attendance.applyManualCorrection({
      orgId: ctx.user.organization,
      userId: v.userId,
      date: v.date,
      clockIn: new Date(v.clockIn),
      clockOut: v.clockOut ? new Date(v.clockOut) : undefined,
      status: v.status,
      note: v.note,
    });
    return { done: true, employee: emp.name, date: v.date, clockIn: v.clockIn, clockOut: v.clockOut ?? null, status: v.status };
  },
});
