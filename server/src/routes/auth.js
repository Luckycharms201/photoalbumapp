import { Router } from 'express';
import { verifyCredentials, requireAdmin } from '../auth.js';
import { config } from '../config.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const ok = await verifyCredentials(email, password);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  // Regenerate the session on login to prevent session fixation.
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start session.' });
    req.session.user = { role: 'admin', email: config.admin.email };
    res.json({ user: req.session.user });
  });
});

// POST /api/auth/logout
router.post('/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/me  — used by the client to restore session on load.
router.get('/me', (req, res) => {
  res.json({ user: req.session?.user ?? null });
});

export default router;
