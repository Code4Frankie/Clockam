import mongoose from 'mongoose';

const METHODS = ['webauthn', 'scanner', 'device-biometric', 'manual'];

const attendanceSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD in the organization's timezone
    clockIn: { type: Date, required: true },
    clockOut: Date,
    status: { type: String, enum: ['present', 'late', 'absent', 'leave'], default: 'present' },
    method: { type: String, enum: METHODS, required: true },
    clockOutMethod: { type: String, enum: METHODS },
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
    location: { lat: Number, lng: Number },
    minutesWorked: { type: Number, default: 0 },
    note: String,
  },
  { timestamps: true }
);

// One attendance record per person per day.
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });
attendanceSchema.index({ organization: 1, date: 1 });

export const Attendance = mongoose.model('Attendance', attendanceSchema);
