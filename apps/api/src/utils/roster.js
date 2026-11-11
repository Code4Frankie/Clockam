import { matricSchema } from './students.js';

// Reads matric numbers pasted from a spreadsheet or typed: separated by commas, semicolons, spaces or new lines.
export function parseMatrics(text) {
  const matrics = [];
  const invalid = [];
  const seen = new Set();
  for (const part of String(text ?? '').split(/[\s,;]+/).filter(Boolean)) {
    const r = matricSchema.safeParse(part);
    if (!r.success) { if (!invalid.includes(part)) invalid.push(part); continue; }
    if (!seen.has(r.data)) { seen.add(r.data); matrics.push(r.data); }
  }
  return { matrics, invalid };
}

// Splits a course list into who is present and who is absent for one class. Ids are compared as strings; roster order is kept.
export function splitPresent(roster, presentIds) {
  const here = new Set(presentIds.filter((x) => x != null).map(String));
  return { present: roster.filter((s) => here.has(String(s.id))), absent: roster.filter((s) => !here.has(String(s.id))) };
}

// Totals per student across a course's classes. `counts` maps student id to classes attended.
export function courseReport(roster, held, counts) {
  return roster.map((s) => {
    const attended = Math.min(counts.get(String(s.id)) || 0, held);
    return { ...s, attended, percent: held ? Math.round((attended / held) * 100) : 0 };
  });
}
