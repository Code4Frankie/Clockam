import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    provider: { type: String, enum: ['paystack'], required: true },
    reference: { type: String, required: true, unique: true },
    amount: { type: Number, required: true }, // kobo, worked out on the server
    breakdown: { tierName: String, workers: Number, monthly: Number, setupFee: Number, vat: Number },
    status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
    paidAt: Date,
  },
  { timestamps: true }
);

export const Payment = mongoose.model('Payment', paymentSchema);
