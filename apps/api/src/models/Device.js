import mongoose from 'mongoose';

// A registered kiosk or hardware scanner. It authenticates to the API with an API key.
const deviceSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['scanner', 'kiosk', 'zkteco'], default: 'scanner' },
    serialNumber: { type: String, trim: true }, // ZKTeco units identify themselves by serial number
    apiKeyHash: { type: String, required: true, select: false },
    active: { type: Boolean, default: true },
    lastSeenAt: Date,
  },
  { timestamps: true }
);

deviceSchema.index({ serialNumber: 1 }, { unique: true, sparse: true });

export const Device = mongoose.model('Device', deviceSchema);
