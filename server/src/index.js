import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { config } from './config.js';
import './db.js'; // initialize schema on boot
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// In dev the React app runs on a separate origin (Vite). Allow it with creds.
app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    name: 'sid',
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd, // requires HTTPS in production
      maxAge: config.session.maxAge,
    },
  })
);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes); // requireAdmin enforced inside the router
app.use('/api/public', publicRoutes);

// 404 for unknown API routes.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Central error handler — always JSON, never an HTML stack trace.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(err.status ?? 500).json({ error: err.message ?? 'Server error.' });
});

app.listen(config.port, () => {
  console.log(`Photo album API listening on http://localhost:${config.port}`);
  console.log(`Allowing client origin: ${config.clientOrigin}`);
});
