// Quotes a cell, and defuses text that a spreadsheet would run as a formula (a name like =HYPERLINK(...)).
export const csvCell = (v) => {
  let s = String(v ?? '');
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
export const csvLine = (cells) => cells.map(csvCell).join(',');
