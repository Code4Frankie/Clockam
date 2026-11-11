import mongoose from 'mongoose';

// The photo is kept apart from the attendance record so it can expire on its own while the attendance stays.
export const SELFIE_DAYS = 30;

const classSelfieSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSession', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  image: { type: Buffer, required: true, select: false },
  createdAt: { type: Date, default: Date.now, expires: SELFIE_DAYS * 24 * 3600 },
});
classSelfieSchema.index({ session: 1, student: 1 }, { unique: true });

export const ClassSelfie = mongoose.model('ClassSelfie', classSelfieSchema);
