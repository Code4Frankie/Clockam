import { z } from 'zod';
import { defineTool, ADMIN } from '../defineTool.js';
import { objectId } from '../schemas.js';
import { HttpError } from '../../utils/http.js';

// Factory for confirmation-gated actions on one employee (admin and above).
export function employeeActionTool({ name, label, description, precheck, describe, apply }) {
  async function loadTarget(ctx, userId) {
    const svc = await import('../../services/employees.service.js');
    const target = await svc.getEmployee({ orgId: ctx.user.organization, userId });
    if (!target) throw new HttpError(404, 'Employee not found');
    svc.assertCanManage(ctx.user, target);
    precheck?.(target);
    return target;
  }

  return defineTool({
    name,
    label,
    description,
    roles: ADMIN,
    confirm: true,
    input: z.object({ userId: objectId }).strict(),
    jsonSchema: {
      type: 'object',
      properties: { userId: { type: 'string', description: 'Employee id from find_employee' } },
      required: ['userId'],
      additionalProperties: false,
    },
    async summarize(ctx, { userId }) {
      const target = await loadTarget(ctx, userId);
      return { text: describe(target), employee: target.name };
    },
    async run(ctx, { userId }) {
      const target = await loadTarget(ctx, userId); // permissions re-checked at execution time
      await apply({ orgId: ctx.user.organization, userId });
      return { done: true, employee: target.name, staffId: target.staffId };
    },
  });
}
