import { z } from 'zod';
import { defineTool, MANAGER } from '../defineTool.js';
import { dateStr, objectId, withDateRange } from '../schemas.js';
import { attendanceRow, MAX_ROWS } from './_shared.js';

export default defineTool({
  name: 'get_attendance',
  label: 'Looking up attendance records…',
  description: 'Attendance records for this workplace between two dates (max 62 days), optionally for one employee.',
  roles: MANAGER,
  input: withDateRange(z.object({ from: dateStr, to: dateStr, userId: objectId.optional() }).strict(), 62),
  jsonSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'YYYY-MM-DD' },
      to: { type: 'string', description: 'YYYY-MM-DD' },
      userId: { type: 'string', description: 'Employee id from find_employee (optional)' },
    },
    required: ['from', 'to'],
    additionalProperties: false,
  },
  async run(ctx, { from, to, userId }) {
    const { getAttendanceRange } = await import('../../services/attendance.service.js');
    const rows = await getAttendanceRange({ orgId: ctx.user.organization, from, to, userId, limit: MAX_ROWS });
    return { count: rows.length, capped: rows.length >= MAX_ROWS, records: rows.map(attendanceRow) };
  },
});
