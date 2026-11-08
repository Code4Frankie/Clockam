import mongoose from 'mongoose';

// One row per emailed reset link. Only the hash of the token is stored, and rows delete themselves after they expire.
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

export const PasswordReset = mongoose.model('PasswordReset', schema);
