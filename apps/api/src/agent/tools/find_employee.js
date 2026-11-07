import { z } from 'zod';
import { defineTool, MANAGER } from '../defineTool.js';

export default defineTool({
  name: 'find_employee',
  label: 'Looking up employees…',
  description: 'Find employees in this workplace by name, staff ID or department. Returns the ids other tools need.',
  roles: MANAGER,
  input: z.object({ query: z.string().trim().min(1).max(60) }).strict(),
  jsonSchema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Part of a name, staff ID or department' } },
    required: ['query'],
    additionalProperties: false,
  },
  async run(ctx, { query }) {
    const { findEmployees } = await import('../../services/employees.service.js');
    return { employees: await findEmployees({ orgId: ctx.user.organization, query, limit: 20 }) };
  },
});
