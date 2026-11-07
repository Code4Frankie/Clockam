import { z } from 'zod';
import { defineTool, MANAGER } from '../defineTool.js';

export default defineTool({
  name: 'list_missing_clockouts',
  label: 'Looking for missing clock-outs…',
  description:
    'Past days where someone clocked in but never clocked out, with a suggested clock-out at closing time. To fix one, an admin can use propose_attendance_correction (needs confirmation).',
  roles: MANAGER,
  input: z.object({}).strict(),
  jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run(ctx) {
    const { listMissingClockouts } = await import('../../services/attendance.service.js');
    const rows = await listMissingClockouts(ctx.org, { limit: 50 });
    return { count: rows.length, records: rows };
  },
});
