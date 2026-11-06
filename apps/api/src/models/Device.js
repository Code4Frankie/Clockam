import mongoose from 'mongoose';

// A registered kiosk or hardware scanner. It authenticates to the API with an API key.
const deviceSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['scanner', 'kiosk'], default: 'scanner' },
    apiKeyHash: { type: String, required: true, select: false },
    active: { type: Boolean, default: true },
    lastSeenAt: Date,
  },
  { timestamps: true }
);

export const Device = mongoose.model('Device', deviceSchema);
