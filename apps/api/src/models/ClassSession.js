import mongoose from 'mongoose';

// One class meeting. The secret stays on the server and drives the rotating code shown in the room.
const classSessionSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    secret: { type: String, required: true, select: false },
    startedAt: { type: Date, default: Date.now },
    endsAt: { type: Date, required: true },
    endedAt: Date,
  },
  { timestamps: true }
);

export const ClassSession = mongoose.model('ClassSession', classSessionSchema);
