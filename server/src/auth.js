import bcrypt from 'bcryptjs';
import { config } from './config.js';

// Resolve the admin password hash once at startup. Prefer ADMIN_PASSWORD_HASH;
// if only a plaintext ADMIN_PASSWORD is given, hash it in memory on boot so we
// never compare plaintext at request time.
let adminPasswordHash = config.admin.passwordHash;
if (!adminPasswordHash) {
  if (!config.admin.password) {
    throw new Error(
      'Set ADMIN_PASSWORD_HASH (preferred) or ADMIN_PASSWORD in your .env file.'
    );
  }
  adminPasswordHash = bcrypt.hashSync(config.admin.password, 12);
}

/** Verify submitted credentials against the single admin account. */
export async function verifyCredentials(email, password) {
  // Constant-ish: always run bcrypt compare even if the email is wrong, to
  // avoid leaking which field failed via timing.
  const emailOk = typeof email === 'string'
    && email.toLowerCase() === config.admin.email.toLowerCase();
  const passOk = await bcrypt.compare(String(password ?? ''), adminPasswordHash);
  return emailOk && passOk;
}

/**
 * Authorization boundary for every admin route. This is the real security
 * control — the UI hiding buttons is cosmetic only. Any request without a
 * valid admin session is rejected with 401 before reaching the handler.
 */
export function requireAdmin(req, res, next) {
  if (req.session?.user?.role === 'admin') {
    return next();
  }
  return res.status(401).json({ error: 'Authentication required.' });
}
