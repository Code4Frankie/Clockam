import { z } from 'zod';
import { defineTool, MANAGER } from '../defineTool.js';
import { attendanceRow, MAX_ROWS } from './_shared.js';

export default defineTool({
  name: 'get_today_overview',
  label: "Checking today's attendance…",
  description: "Today's headcount: staff total, clocked in, late, not in yet, plus who has clocked in.",
  roles: MANAGER,
  input: z.object({}).strict(),
  jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run(ctx) {
    const { getTodayOverview } = await import('../../services/attendance.service.js');
    const o = await getTodayOverview(ctx.org);
    return {
      date: o.date,
      totalStaff: o.totalStaff,
      clockedIn: o.present,
      late: o.late,
      notInYet: o.absent,
      records: o.records.slice(0, MAX_ROWS).map(attendanceRow),
    };
  },
});
