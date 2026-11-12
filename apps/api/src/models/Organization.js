import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    type: { type: String, enum: ['workplace', 'school', 'government'], default: 'workplace' }, // workplace = business
    requireSelfie: { type: Boolean, default: true }, // schools: students take a selfie when marking attendance
    suspended: { at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, reason: String },
    billing: {
      paidUntil: Date,
      packageName: String, // the package the owner subscribed to
      trialEndsAt: Date, // set when a platform admin extends the trial
      exempt: { type: Boolean, default: false }, // billing waived by a platform admin
      setupPaid: { type: Boolean, default: false },
    },
    timezone: { type: String, default: 'Africa/Lagos' },
    workStart: { type: String, default: '08:00' }, // HH:mm local time
    workEnd: { type: String, default: '17:00' },
    graceMinutes: { type: Number, default: 15 },
    autoClockOutHours: { type: Number, default: 0, min: 0, max: 12 }, // 0 = off; otherwise close open days this many hours after closing time
    allowedNetworks: { type: [String], default: [] }, // public IPs / IPv4 ranges personal devices may clock in from; empty = no network rule
    geofence: {
      enabled: { type: Boolean, default: false },
      lat: Number,
      lng: Number,
      radiusMeters: { type: Number, default: 150 },
    },
  },
  { timestamps: true }
);

export const Organization = mongoose.model('Organization', organizationSchema);
