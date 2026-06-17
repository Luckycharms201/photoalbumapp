import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

// --- Storage interface ------------------------------------------------------
// Every method works in terms of an opaque "key" (a relative path string).
// The route/service layer never touches the filesystem directly, so this whole
// module can later be replaced by an S3-backed implementation that honours the
// same contract: save(key, buffer), readStream(key), remove(key),
// absolutePath(key) (optional), exists(key).

const root = config.paths.uploads;
fs.mkdirSync(root, { recursive: true });

function resolveKey(key) {
  // Prevent path traversal: the resolved path must stay inside the root.
  const resolved = path.resolve(root, key);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return resolved;
}

export const storage = {
  async save(key, buffer) {
    const dest = resolveKey(key);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.writeFile(dest, buffer);
    return key;
  },

  readStream(key) {
    return fs.createReadStream(resolveKey(key));
  },

  async readBuffer(key) {
    return fsp.readFile(resolveKey(key));
  },

  async remove(key) {
    try {
      await fsp.unlink(resolveKey(key));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err; // already gone is fine
    }
  },

  async exists(key) {
    try {
      await fsp.access(resolveKey(key));
      return true;
    } catch {
      return false;
    }
  },

  // Local-only helper used for efficient static serving / zip streaming.
  // An S3 implementation would omit this and rely on streams.
  absolutePath(key) {
    return resolveKey(key);
  },
};

export default storage;
