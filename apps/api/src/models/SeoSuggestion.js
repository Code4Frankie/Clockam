import mongoose from 'mongoose';

// Agent-drafted title/description fixes. They are only queued here; a platform admin approves or rejects.
// Approving does not change the site: apply the text yourself in the web app.
const schema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    field: { type: String, enum: ['title', 'description'], required: true },
    suggestion: { type: String, required: true, maxlength: 300 },
    reason: { type: String, maxlength: 300 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export const SeoSuggestion = mongoose.model('SeoSuggestion', schema, 'seosuggestions');
