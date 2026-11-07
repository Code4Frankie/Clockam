import { z } from 'zod';
import { defineTool } from '../defineTool.js';

// Queues a suggestion for human approval. It publishes nothing, so it does not need the confirm step.
export default defineTool({
  name: 'queue_seo_suggestion',
  label: 'Queuing an SEO suggestion for review…',
  description:
    'Queue a suggested page title or meta description for a flagged page so a platform admin can approve or reject it. Does not change the site.',
  roles: [],
  platformAdmin: true,
  input: z
    .object({
      url: z.string().trim().min(1).max(300),
      field: z.enum(['title', 'description']),
      suggestion: z.string().trim().min(10).max(200),
      reason: z.string().trim().max(200).optional(),
    })
    .strict(),
  jsonSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Page URL from the audit report' },
      field: { type: 'string', enum: ['title', 'description'] },
      suggestion: { type: 'string', description: 'Suggested text: titles up to 60 characters, descriptions 50 to 160' },
      reason: { type: 'string' },
    },
    required: ['url', 'field', 'suggestion'],
    additionalProperties: false,
  },
  async run(ctx, v) {
    const { SeoSuggestion } = await import('../../models/SeoSuggestion.js');
    const doc = await SeoSuggestion.create({ ...v, createdBy: ctx.user._id });
    return { queued: true, id: String(doc._id), status: 'pending' };
  },
});
