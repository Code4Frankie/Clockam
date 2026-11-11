import mongoose from 'mongoose';

const classAttendanceSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSession', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
    flags: [String],
    location: { lat: Number, lng: Number },
  },
  { timestamps: true }
);

classAttendanceSchema.index({ session: 1, student: 1 }, { unique: true }); // one mark per student per class

export const ClassAttendance = mongoose.model('ClassAttendance', classAttendanceSchema);
