import { z } from 'zod';
import { defineTool, MANAGER } from '../defineTool.js';
import { dateStr, withDateRange } from '../schemas.js';

export default defineTool({
  name: 'get_report_summary',
  label: 'Building the attendance summary…',
  description: 'Per-employee totals between two dates (max 92 days): days present, days late, hours worked.',
  roles: MANAGER,
  input: withDateRange(z.object({ from: dateStr, to: dateStr }).strict(), 92),
  jsonSchema: {
    type: 'object',
    properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } },
    required: ['from', 'to'],
    additionalProperties: false,
  },
  async run(ctx, { from, to }) {
    const { buildSummary } = await import('../../services/reports.service.js');
    const rows = await buildSummary({ orgId: ctx.user.organization, from, to });
    return { from, to, employees: rows };
  },
});
