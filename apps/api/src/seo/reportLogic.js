// Pure grouping and regression logic for the audit report.

const ORDER = { high: 0, medium: 1, low: 2 };
const counts = (issues) => ({
  high: issues.filter((i) => i.severity === 'high').length,
  medium: issues.filter((i) => i.severity === 'medium').length,
  low: issues.filter((i) => i.severity === 'low').length,
});
const keys = (docs) => new Set(docs.flatMap((d) => d.issues.map((i) => `${d.url}|${i.code}`)));

export function summarizeRuns(docs) {
  const runs = new Map();
  for (const d of docs) {
    const r = runs.get(d.runId) || { runId: d.runId, checkedAt: d.checkedAt, pages: 0, issues: [] };
    r.pages += 1;
    r.issues.push(...d.issues);
    runs.set(d.runId, r);
  }
  return [...runs.values()].map((r) => ({ runId: r.runId, checkedAt: r.checkedAt, pages: r.pages, ...counts(r.issues) }));
}

export function buildReport({ current, previous = [], history = [] }) {
  const byType = new Map();
  for (const d of current) {
    const g = byType.get(d.pageType) || { pageType: d.pageType, pages: 0, issues: [], byCode: new Map() };
    g.pages += 1;
    g.issues.push(...d.issues);
    for (const i of d.issues) {
      const c = g.byCode.get(i.code) || { code: i.code, severity: i.severity, count: 0, example: i.message, urls: [] };
      c.count += 1;
      if (c.urls.length < 5) c.urls.push(d.url);
      g.byCode.set(i.code, c);
    }
    byType.set(d.pageType, g);
  }

  const groups = [...byType.values()].map((g) => ({
    pageType: g.pageType,
    pages: g.pages,
    totals: counts(g.issues),
    issues: [...g.byCode.values()].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || b.count - a.count),
  }));

  const prevKeys = keys(previous);
  const curKeys = keys(current);
  const hasPrev = previous.length > 0;
  const regressions = hasPrev
    ? current.flatMap((d) => d.issues.filter((i) => !prevKeys.has(`${d.url}|${i.code}`)).map((i) => ({ url: d.url, code: i.code, severity: i.severity, message: i.message })))
    : [];
  const resolved = hasPrev
    ? previous.flatMap((d) => d.issues.filter((i) => !curKeys.has(`${d.url}|${i.code}`)).map((i) => ({ url: d.url, code: i.code, severity: i.severity })))
    : [];

  return {
    runId: current[0]?.runId ?? null,
    checkedAt: current[0]?.checkedAt ?? null,
    summary: { pages: current.length, ...counts(current.flatMap((d) => d.issues)) },
    groups: groups.sort((a, b) => a.pageType.localeCompare(b.pageType)),
    regressions,
    resolved,
    history,
  };
}
