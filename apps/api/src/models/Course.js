import mongoose from 'mongoose';

// A course and the students registered for it. Classes started for a course can then show who is absent.
const courseSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);
courseSchema.index({ organization: 1, code: 1 }, { unique: true });

export const Course = mongoose.model('Course', courseSchema);
