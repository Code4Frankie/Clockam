import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    timezone: { type: String, default: 'Africa/Lagos' },
    workStart: { type: String, default: '08:00' }, // HH:mm local time
    workEnd: { type: String, default: '17:00' },
    graceMinutes: { type: Number, default: 15 },
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
