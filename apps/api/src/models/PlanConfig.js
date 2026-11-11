import mongoose from 'mongoose';

// One document holds the prices for the whole platform. Edited in the app by a platform admin. Amounts are in kobo.
const planConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    setupFee: { type: Number, default: 0 },
    vatPercent: { type: Number, default: 0 },
    trialDays: { type: Number, default: 0 },
    tiers: [{ _id: false, name: String, minWorkers: Number, maxWorkers: { type: Number, default: null }, monthlyPrice: Number }],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const PlanConfig = mongoose.model('PlanConfig', planConfigSchema);
