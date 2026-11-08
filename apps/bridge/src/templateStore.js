import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Fingerprint templates live in one small file on this PC and never go to the ClockAm server.
 * The file is private to the current Windows user. Turn on BitLocker so the disk is encrypted too.
 */
export function createTemplateStore(dir = process.env.BRIDGE_DATA_DIR || path.join(os.homedir(), '.clockam-bridge')) {
  const file = path.join(dir, 'templates.json');
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw new Error(`Cannot read ${file}: ${e.message}`);
  }

  function persist() {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  return {
    file,
    ids: () => Object.keys(data),
    get: (id) => data[id],
    set(id, template) { data[id] = template; persist(); },
    remove(id) {
      if (!(id in data)) return false;
      delete data[id];
      persist();
      return true;
    },
  };
}
