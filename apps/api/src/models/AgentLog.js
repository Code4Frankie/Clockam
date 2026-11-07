import mongoose from 'mongoose';

const STATUSES = ['ok', 'error', 'denied', 'invalid_input', 'pending_confirmation', 'confirmed', 'cancelled'];

// One row per tool call. Stores validated input and status, not full results (privacy).
const agentLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    tool: { type: String, required: true },
    input: mongoose.Schema.Types.Mixed,
    status: { type: String, enum: STATUSES, required: true },
    error: String,
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const days = Number(process.env.AGENT_LOG_RETENTION_DAYS) || 90;
agentLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: days * 86400 });

export const AgentLog = mongoose.model('AgentLog', agentLogSchema, 'agentlogs');
