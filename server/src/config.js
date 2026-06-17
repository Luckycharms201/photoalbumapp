import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  // Where the client is served from in dev, used for building public links + CORS.
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  // Public-facing base URL used when generating shareable links.
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',

  admin: {
    email: required('ADMIN_EMAIL', 'admin@example.com'),
    // Either a pre-hashed password (preferred) or a plaintext one hashed on boot.
    passwordHash: process.env.ADMIN_PASSWORD_HASH ?? null,
    password: process.env.ADMIN_PASSWORD ?? null,
  },

  session: {
    secret: required('SESSION_SECRET', 'dev-insecure-secret-change-me'),
    // 7 days
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },

  paths: {
    serverRoot,
    data: path.resolve(serverRoot, process.env.DATA_DIR ?? 'data'),
    uploads: path.resolve(serverRoot, process.env.UPLOADS_DIR ?? 'uploads'),
    dbFile: path.resolve(serverRoot, process.env.DATA_DIR ?? 'data', 'app.db'),
  },

  uploads: {
    // 25 MB per file
    maxFileBytes: Number(process.env.MAX_FILE_MB ?? 25) * 1024 * 1024,
    maxFilesPerBatch: Number(process.env.MAX_FILES_PER_BATCH ?? 100),
    // Accepted input mime types. HEIC is converted to JPEG on ingest.
    allowedMime: new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ]),
    thumbnailWidth: 480,
    // page size for the gallery API
    pageSize: Number(process.env.GALLERY_PAGE_SIZE ?? 24),
  },

  isProd: process.env.NODE_ENV === 'production',
};
