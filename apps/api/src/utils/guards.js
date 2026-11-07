import crypto from 'node:crypto';

// Pure helpers (no database, no env) so they can be unit tested on their own.

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Rejects Mongo operators ("$where", "$ne"...) and dotted paths anywhere in model-supplied input.
export function assertNoOperatorKeys(value, path = 'input', depth = 0) {
  if (depth > 6) throw new Error(`${path} is nested too deeply`);
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoOperatorKeys(v, `${path}[${i}]`, depth + 1));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$') || k.includes('.')) throw new Error(`Forbidden key "${k}" in ${path}`);
      assertNoOperatorKeys(v, `${path}.${k}`, depth + 1);
    }
  }
}

const SECRET_KEYS = new Set(
  [
    'passwordhash', 'password', 'currentchallenge', 'publickey', 'credentialid', 'webauthncredentials',
    'scannerlinks', 'apikeyhash', 'apikey', 'devicekey', 'token', 'jwt', 'secret',
  ]
);

// Defence in depth: tool output must never contain secret-bearing fields.
export function assertNoSecrets(value, path = 'result', depth = 0) {
  if (depth > 8) return;
  if (Array.isArray(value)) return value.forEach((v, i) => assertNoSecrets(v, `${path}[${i}]`, depth + 1));
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEYS.has(k.toLowerCase())) throw new Error(`Secret field "${k}" found in ${path}`);
      assertNoSecrets(v, `${path}.${k}`, depth + 1);
    }
  }
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export const hashInput = (input) => crypto.createHash('sha256').update(stableStringify(input)).digest('hex');

// Tool results are records, not instructions. Delimit them and stop them closing the delimiter.
export function wrapToolResult(result) {
  const json = JSON.stringify(result).replace(/<\/untrusted_data>/gi, '<\\/untrusted_data>');
  return `<untrusted_data>\n${json}\n</untrusted_data>`;
}

// For short labels (names) placed in the system prompt: single line, no angle brackets, length-capped.
export const safeLabel = (s, max = 80) => String(s ?? '').replace(/[\r\n\t<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function clip(value, max = 2000) {
  try {
    const s = JSON.stringify(value);
    if (s === undefined || s.length <= max) return value;
    return { truncated: true, preview: s.slice(0, 300) };
  } catch {
    return { truncated: true };
  }
}
