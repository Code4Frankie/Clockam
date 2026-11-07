import mongoose from 'mongoose';

// One row per page (or deployment check) per crawl run. Keeping every run gives history, so regressions are visible.
const schema = new mongoose.Schema(
  {
    runId: { type: String, required: true, index: true },
    url: { type: String, required: true },
    pageType: { type: String, enum: ['public', 'private', 'deployment', 'sitemap'], required: true },
    status: Number,
    redirects: [String],
    issues: [{ _id: false, code: String, severity: { type: String, enum: ['high', 'medium', 'low'] }, message: String }],
    meta: mongoose.Schema.Types.Mixed,
    checkedAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

export const SeoAudit = mongoose.model('SeoAudit', schema, 'seoaudits');
