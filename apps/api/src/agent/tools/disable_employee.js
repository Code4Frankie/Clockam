import { employeeActionTool } from './_employeeAction.js';
import { HttpError } from '../../utils/http.js';

export default employeeActionTool({
  name: 'disable_employee',
  label: 'Preparing to disable an employee…',
  description: 'Disable an employee account so they can no longer sign in or clock in. Needs the user to confirm.',
  precheck: (t) => {
    if (!t.active) throw new HttpError(409, 'This employee is already disabled');
  },
  describe: (t) => `Disable ${t.name} (${t.staffId}). They will no longer be able to sign in or clock in until re-enabled.`,
  apply: async (args) => (await import('../../services/employees.service.js')).setEmployeeActive({ ...args, active: false }),
});
