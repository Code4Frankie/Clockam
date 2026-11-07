import { z } from 'zod';
import { defineTool, ANY } from '../defineTool.js';
import { dateStr, withDateRange } from '../schemas.js';
import { attendanceRow } from './_shared.js';

export default defineTool({
  name: 'get_my_attendance',
  label: 'Looking up your attendance…',
  description: "The signed-in user's own attendance records between two dates (max 62 days).",
  roles: ANY,
  input: withDateRange(z.object({ from: dateStr, to: dateStr }).strict(), 62),
  jsonSchema: {
    type: 'object',
    properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } },
    required: ['from', 'to'],
    additionalProperties: false,
  },
  async run(ctx, { from, to }) {
    const { getMyRecords } = await import('../../services/attendance.service.js');
    const rows = await getMyRecords({ userId: ctx.user._id, from, to });
    return { records: rows.map(attendanceRow) };
  },
});
