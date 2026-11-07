import { z } from 'zod';
import { defineTool, MANAGER } from '../defineTool.js';
import { dateStr } from '../schemas.js';
import { attendanceRow, personRow } from './_shared.js';

export default defineTool({
  name: 'list_late_and_absent',
  label: 'Checking who is late or absent…',
  description:
    'Who was late and who has no attendance record on one date. Weekends, leave and public holidays are not considered: anyone without a record counts as not in.',
  roles: MANAGER,
  input: z.object({ date: dateStr }).strict(),
  jsonSchema: {
    type: 'object',
    properties: { date: { type: 'string', description: 'YYYY-MM-DD' } },
    required: ['date'],
    additionalProperties: false,
  },
  async run(ctx, { date }) {
    const { getDayOverview } = await import('../../services/attendance.service.js');
    const o = await getDayOverview(ctx.org, date, { withAbsentees: true });
    return {
      date,
      late: o.records.filter((r) => r.status === 'late').map(attendanceRow),
      notIn: o.absentees.map(personRow),
      counts: { totalStaff: o.totalStaff, clockedIn: o.present, late: o.late, notIn: o.absent },
    };
  },
});
