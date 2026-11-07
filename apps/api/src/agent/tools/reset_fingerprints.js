import { employeeActionTool } from './_employeeAction.js';

export default employeeActionTool({
  name: 'reset_fingerprints',
  label: 'Preparing to reset fingerprints…',
  description: "Remove an employee's enrolled phone/PC fingerprints and scanner links (for example after a lost phone). Needs the user to confirm.",
  describe: (t) =>
    `Remove all enrolled fingerprints for ${t.name} (${t.staffId}): ${t.webauthnCredentials?.length || 0} phone/PC and ${t.scannerLinks?.length || 0} scanner link(s). They will have to enrol again.`,
  apply: async (args) => (await import('../../services/employees.service.js')).clearFingerprints(args),
});
