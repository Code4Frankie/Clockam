import { z } from 'zod';
import { defineTool } from '../defineTool.js';

export default defineTool({
  name: 'get_seo_report',
  label: 'Reading the site audit…',
  description: 'Latest site and deployment audit (SEO, noindex on private pages, deployment checks) with regressions since the previous run. Platform admins only.',
  roles: [],
  platformAdmin: true,
  input: z.object({}).strict(),
  jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run() {
    const { getSeoReport } = await import('../../seo/report.js');
    const r = await getSeoReport();
    return { ...r, regressions: r.regressions.slice(0, 25), resolved: r.resolved.slice(0, 25) };
  },
});
