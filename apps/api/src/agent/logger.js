import { clip } from '../utils/guards.js';

// Logging must never break a request.
export async function logToolCall({ ctx, tool, input, status, error }) {
  try {
    const { AgentLog } = await import('../models/AgentLog.js');
    await AgentLog.create({
      user: ctx.user._id,
      organization: ctx.user.organization,
      tool,
      input: clip(input ?? {}),
      status,
      error,
    });
  } catch (e) {
    console.error('agentlog write failed:', e.message);
  }
}
