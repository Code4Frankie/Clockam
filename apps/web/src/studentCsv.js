// Reads a student list exported from Excel or Google Sheets (CSV). Columns: name, matric number, optional department.
// Handles a leading byte-order mark, Windows line endings, quoted cells and semicolon separators.
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const MATRIC = /^[A-Za-z0-9][A-Za-z0-9/._-]{2,31}$/;
const col = (header, words) => header.findIndex((h) => words.some((w) => h.includes(w)));

// Returns { students, problems }. Problems name the row so the school can fix the file.
export function parseStudents(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { students: [], problems: ['The file is empty'] };
  const head = rows[0].map((c) => c.trim().toLowerCase());
  const hasHeader = head.some((h) => /name|matric|reg/.test(h));
  let iName = 0, iMatric = 1, iDept = 2, start = 0;
  if (hasHeader) {
    start = 1;
    iMatric = col(head, ['matric', 'reg', 'student id', 'id']);
    iName = col(head, ['name']);
    iDept = col(head, ['department', 'dept', 'faculty', 'class']);
    if (iName < 0 || iMatric < 0) return { students: [], problems: ['The first row must have a "Name" column and a "Matric number" column'] };
  }
  const students = [], problems = [];
  rows.slice(start).forEach((r, k) => {
    const line = k + start + 1;
    const name = (r[iName] || '').trim().replace(/\s+/g, ' ');
    const matric = (r[iMatric] || '').trim();
    if (name.length < 2) return problems.push(`Row ${line}: name is missing`);
    if (!MATRIC.test(matric)) return problems.push(`Row ${line}: "${matric}" is not a valid matric number`);
    const dept = iDept >= 0 ? (r[iDept] || '').trim() : '';
    students.push(dept ? { name, matric, department: dept } : { name, matric });
  });
  if (students.length > 2000) problems.push('Upload at most 2000 students at a time');
  return { students, problems };
}

// For a course list: takes the matric column out of a CSV (by its header, or the first column) and returns plain text, one per line.
export function matricsFromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return '';
  const head = rows[0].map((c) => c.trim().toLowerCase());
  const named = head.findIndex((h) => /matric|reg/.test(h));
  const hasHeader = named >= 0 || head.some((h) => /name|department|dept/.test(h));
  const idx = named >= 0 ? named : 0;
  return rows.slice(hasHeader ? 1 : 0).map((r) => (r[idx] || '').trim()).filter(Boolean).join('\n');
}
