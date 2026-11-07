import { employeeActionTool } from './_employeeAction.js';
import { HttpError } from '../../utils/http.js';

export default employeeActionTool({
  name: 'enable_employee',
  label: 'Preparing to re-enable an employee…',
  description: 'Re-enable a disabled employee account. Needs the user to confirm.',
  precheck: (t) => {
    if (t.active) throw new HttpError(409, 'This employee is already active');
  },
  describe: (t) => `Re-enable ${t.name} (${t.staffId}) so they can sign in and clock in again.`,
  apply: async (args) => (await import('../../services/employees.service.js')).setEmployeeActive({ ...args, active: true }),
});
