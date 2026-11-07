import { hashInput } from '../utils/guards.js';
import { HttpError } from '../utils/http.js';

export function buildConfirmation({ ctx, tool, input, summary, ttlSeconds, now = new Date() }) {
  return {
    user: ctx.user._id,
    organization: ctx.user.organization,
    tool,
    input,
    inputHash: hashInput(input),
    summary,
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
  };
}

// Checked again at execution time, in addition to the atomic query in consume().
export function assertConfirmationValid(record, ctx, now = new Date()) {
  if (!record) throw new HttpError(404, 'Confirmation not found, already used, or expired');
  if (String(record.user) !== String(ctx.user._id) || String(record.organization) !== String(ctx.user.organization)) {
    throw new HttpError(403, 'This confirmation belongs to another user');
  }
  if (new Date(record.expiresAt) <= now) throw new HttpError(410, 'This confirmation has expired');
  if (hashInput(record.input) !== record.inputHash) throw new HttpError(409, 'The confirmation data was changed and cannot run');
}

// Database-backed store (models loaded lazily so the logic above is testable without Mongo).
export const confirmationStore = {
  async create(ctx, tool, input, summary) {
    const [{ AgentConfirmation }, { env }] = await Promise.all([
      import('../models/AgentConfirmation.js'),
      import('../config/env.js'),
    ]);
    const doc = await AgentConfirmation.create(
      buildConfirmation({ ctx, tool, input, summary, ttlSeconds: env.AGENT_CONFIRM_TTL_SECONDS })
    );
    return { id: String(doc._id), expiresAt: doc.expiresAt };
  },

  // Atomic: marks the confirmation used and returns it only if it is still pending, unexpired and ours.
  async consume(ctx, id, outcome = 'confirmed') {
    const { AgentConfirmation } = await import('../models/AgentConfirmation.js');
    return AgentConfirmation.findOneAndUpdate(
      { _id: id, user: ctx.user._id, organization: ctx.user.organization, used: false, expiresAt: { $gt: new Date() } },
      { used: true, usedAt: new Date(), outcome },
      { new: false }
    ).lean();
  },
};
