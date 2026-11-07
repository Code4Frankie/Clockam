import mongoose from 'mongoose';

// A write action the assistant proposed. Runs only after the same user confirms, once, before expiry.
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    tool: { type: String, required: true },
    input: mongoose.Schema.Types.Mixed,
    inputHash: { type: String, required: true },
    summary: mongoose.Schema.Types.Mixed,
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
    usedAt: Date,
    outcome: { type: String, enum: ['confirmed', 'cancelled', 'failed'] },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 }); // tidy up an hour after expiry

export const AgentConfirmation = mongoose.model('AgentConfirmation', schema, 'agentconfirmations');
