import mongoose from 'mongoose';

const webauthnCredentialSchema = new mongoose.Schema(
  {
    credentialId: { type: String, required: true }, // base64url
    publicKey: { type: String, required: true }, // base64url
    counter: { type: Number, default: 0 },
    transports: [String],
    deviceName: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const scannerLinkSchema = new mongoose.Schema(
  {
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
    scannerUserId: { type: String, required: true }, // ID the scanner reports after matching on-device
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    staffId: { type: String, required: true, trim: true },
    phone: String,
    department: String,
    role: { type: String, enum: ['owner', 'admin', 'manager', 'employee'], default: 'employee' },
    passwordHash: { type: String, required: true, select: false },
    active: { type: Boolean, default: true },
    webauthnCredentials: [webauthnCredentialSchema],
    scannerLinks: [scannerLinkSchema],
    currentChallenge: { type: String, select: false },
  },
  { timestamps: true }
);

userSchema.index({ organization: 1, email: 1 }, { unique: true });
userSchema.index({ organization: 1, staffId: 1 }, { unique: true });

export const User = mongoose.model('User', userSchema);
