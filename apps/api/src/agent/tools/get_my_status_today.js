import { z } from 'zod';
import { defineTool, ANY } from '../defineTool.js';

export default defineTool({
  name: 'get_my_status_today',
  label: 'Checking your status today…',
  description: 'Whether the signed-in user has clocked in or out today. Use for "Have I clocked in?" questions.',
  roles: ANY,
  input: z.object({}).strict(),
  jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run(ctx) {
    const { todayKey, getUserRecord } = await import('../../services/attendance.service.js');
    const date = todayKey(ctx.org);
    const r = await getUserRecord({ userId: ctx.user._id, date });
    return {
      date,
      clockedIn: !!r,
      clockedOut: !!r?.clockOut,
      clockIn: r?.clockIn ?? null,
      clockOut: r?.clockOut ?? null,
      status: r?.status ?? null,
      workStart: ctx.org.workStart,
      workEnd: ctx.org.workEnd,
    };
  },
});
