import { SeoAudit } from '../models/SeoAudit.js';
import { buildReport, summarizeRuns } from './reportLogic.js';

export async function getSeoReport() {
  const recent = await SeoAudit.find().sort({ checkedAt: -1 }).limit(1500).lean();
  if (!recent.length) return { empty: true, message: 'No audit has run yet. Run: node apps/api/src/seo/crawl.js', summary: null, groups: [], regressions: [], resolved: [], history: [] };

  const runIds = [...new Set(recent.map((d) => d.runId))];
  const current = recent.filter((d) => d.runId === runIds[0]);
  const previous = runIds[1] ? recent.filter((d) => d.runId === runIds[1]) : [];
  return buildReport({ current, previous, history: summarizeRuns(recent).slice(0, 10) });
}
