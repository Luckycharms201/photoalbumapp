import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { db } from '../db.js';
import { storage } from '../storage/localStorage.js';
import { processAndStore } from '../images.js';
import { requireAdmin } from '../auth.js';
import { config } from '../config.js';

const router = Router();

// Every admin route sits behind the authorization boundary. This is enforced
// here on the server — not by hiding buttons in the UI.
router.use(requireAdmin);

// --- helpers ----------------------------------------------------------------
function newToken() {
  return crypto.randomBytes(24).toString('base64url'); // ~32 unguessable chars
}

function publicUrlFor(token) {
  return `${config.publicBaseUrl.replace(/\/$/, '')}/album/${token}`;
}

function serializeAlbum(a) {
  return {
    id: a.id,
    title: a.title,
    isPublic: !!a.is_public,
    publicToken: a.public_token,
    publicUrl: a.public_token ? publicUrlFor(a.public_token) : null,
    coverPhotoId: a.cover_photo_id,
    photoCount: a.photo_count ?? 0,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

function getAlbumOr404(req, res) {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!album) {
    res.status(404).json({ error: 'Album not found.' });
    return null;
  }
  return album;
}

// --- multer (in-memory so sharp can process buffers) ------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploads.maxFileBytes,
    files: config.uploads.maxFilesPerBatch,
  },
  fileFilter(req, file, cb) {
    if (config.uploads.allowedMime.has(file.mimetype)) return cb(null, true);
    cb(new MulterTypeError(`Unsupported file type: ${file.mimetype}`));
  },
});

class MulterTypeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MulterTypeError';
    this.status = 400;
  }
}

// Wrap multer so its errors become clean JSON instead of HTML stack traces.
function uploadArray(field) {
  const mw = upload.array(field, config.uploads.maxFilesPerBatch);
  return (req, res, next) =>
    mw(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        const map = {
          LIMIT_FILE_SIZE: `A file exceeds the ${config.uploads.maxFileBytes / 1024 / 1024} MB limit.`,
          LIMIT_FILE_COUNT: `Too many files in one batch (max ${config.uploads.maxFilesPerBatch}).`,
        };
        return res.status(400).json({ error: map[err.code] ?? err.message });
      }
      return res.status(err.status ?? 400).json({ error: err.message });
    });
}

// --- album CRUD -------------------------------------------------------------

// GET /api/admin/albums  — all albums with photo counts + cover thumb key.
router.get('/albums', (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.*, COUNT(p.id) AS photo_count
       FROM albums a LEFT JOIN photos p ON p.album_id = a.id
       GROUP BY a.id ORDER BY a.created_at DESC`
    )
    .all();
  res.json({ albums: rows.map(serializeAlbum) });
});

// POST /api/admin/albums  { title }
router.post('/albums', (req, res) => {
  const title = String(req.body?.title ?? '').trim();
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const info = db.prepare('INSERT INTO albums (title) VALUES (?)').run(title);
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ album: serializeAlbum(album) });
});

// PATCH /api/admin/albums/:id  { title?, isPublic? }
router.patch('/albums/:id', (req, res) => {
  const album = getAlbumOr404(req, res);
  if (!album) return;

  const updates = [];
  const params = [];

  if (req.body?.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) return res.status(400).json({ error: 'Title cannot be empty.' });
    updates.push('title = ?');
    params.push(title);
  }

  if (req.body?.isPublic !== undefined) {
    const makePublic = !!req.body.isPublic;
    updates.push('is_public = ?');
    params.push(makePublic ? 1 : 0);
    // Mint a token the first time an album becomes public; keep it afterwards.
    if (makePublic && !album.public_token) {
      updates.push('public_token = ?');
      params.push(newToken());
    }
  }

  if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });

  updates.push("updated_at = datetime('now')");
  db.prepare(`UPDATE albums SET ${updates.join(', ')} WHERE id = ?`).run(...params, album.id);

  const updated = db
    .prepare(
      `SELECT a.*, (SELECT COUNT(*) FROM photos WHERE album_id = a.id) AS photo_count
       FROM albums a WHERE a.id = ?`
    )
    .get(album.id);
  res.json({ album: serializeAlbum(updated) });
});

// POST /api/admin/albums/:id/rotate-token  — invalidate old link, issue a new one.
router.post('/albums/:id/rotate-token', (req, res) => {
  const album = getAlbumOr404(req, res);
  if (!album) return;
  const token = newToken();
  db.prepare("UPDATE albums SET public_token = ?, updated_at = datetime('now') WHERE id = ?")
    .run(token, album.id);
  res.json({ publicToken: token, publicUrl: publicUrlFor(token) });
});

// DELETE /api/admin/albums/:id  — removes DB rows (cascade) and all files.
router.delete('/albums/:id', async (req, res) => {
  const album = getAlbumOr404(req, res);
  if (!album) return;
  const photos = db.prepare('SELECT storage_key, thumb_key FROM photos WHERE album_id = ?').all(album.id);
  db.prepare('DELETE FROM albums WHERE id = ?').run(album.id); // cascades to photos
  // Best-effort file cleanup after the DB is the source of truth.
  await Promise.all(
    photos.flatMap((p) => [storage.remove(p.storage_key), storage.remove(p.thumb_key)])
  );
  res.json({ ok: true });
});

// --- album detail + photos --------------------------------------------------

// GET /api/admin/albums/:id?page=1  — album with a page of photos.
router.get('/albums/:id', (req, res) => {
  const album = getAlbumOr404(req, res);
  if (!album) return;

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = config.uploads.pageSize;
  const offset = (page - 1) * pageSize;

  const total = db.prepare('SELECT COUNT(*) AS c FROM photos WHERE album_id = ?').get(album.id).c;
  const photos = db
    .prepare(
      `SELECT * FROM photos WHERE album_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(album.id, pageSize, offset);

  res.json({
    album: serializeAlbum({ ...album, photo_count: total }),
    photos: photos.map(serializePhotoAdmin),
    page,
    pageSize,
    total,
    hasMore: offset + photos.length < total,
  });
});

function serializePhotoAdmin(p) {
  return {
    id: p.id,
    albumId: p.album_id,
    name: p.original_name,
    mime: p.mime,
    width: p.width,
    height: p.height,
    sizeBytes: p.size_bytes,
    thumbUrl: `/api/admin/photos/${p.id}/thumb`,
    rawUrl: `/api/admin/photos/${p.id}/raw`,
    createdAt: p.created_at,
  };
}

// POST /api/admin/albums/:id/photos  (multipart: field "photos")
router.post('/albums/:id/photos', uploadArray('photos'), async (req, res) => {
  const album = getAlbumOr404(req, res);
  if (!album) return;

  const files = req.files ?? [];
  if (!files.length) return res.status(400).json({ error: 'No files received.' });

  const created = [];
  const failed = [];
  // Process sequentially to keep memory bounded on large batches.
  for (const file of files) {
    try {
      const meta = await processAndStore(storage, album.id, file);
      const info = db
        .prepare(
          `INSERT INTO photos
             (album_id, original_name, storage_key, thumb_key, mime, size_bytes, width, height)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(album.id, meta.original_name, meta.storage_key, meta.thumb_key, meta.mime,
             meta.size_bytes, meta.width, meta.height);
      const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(info.lastInsertRowid);
      created.push(serializePhotoAdmin(row));
    } catch (err) {
      failed.push({ name: file.originalname, error: err.message });
    }
  }

  // Default the cover to the first uploaded photo if none set yet.
  if (!album.cover_photo_id && created.length) {
    db.prepare("UPDATE albums SET cover_photo_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(created[0].id, album.id);
  }

  res.status(failed.length && !created.length ? 400 : 201).json({ created, failed });
});

// PATCH /api/admin/albums/:id/cover  { photoId }
router.patch('/albums/:id/cover', (req, res) => {
  const album = getAlbumOr404(req, res);
  if (!album) return;
  const photoId = req.body?.photoId;
  const photo = db.prepare('SELECT id FROM photos WHERE id = ? AND album_id = ?').get(photoId, album.id);
  if (!photo) return res.status(400).json({ error: 'Photo not in this album.' });
  db.prepare("UPDATE albums SET cover_photo_id = ?, updated_at = datetime('now') WHERE id = ?")
    .run(photoId, album.id);
  res.json({ ok: true });
});

// DELETE /api/admin/photos/:id  — single photo + its files.
router.delete('/photos/:id', async (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found.' });
  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
  // If this was the album cover, clear it.
  db.prepare('UPDATE albums SET cover_photo_id = NULL WHERE cover_photo_id = ?').run(photo.id);
  await Promise.all([storage.remove(photo.storage_key), storage.remove(photo.thumb_key)]);
  res.json({ ok: true });
});

// --- authenticated image serving -------------------------------------------
function sendImage(res, key, mime, download = null) {
  res.setHeader('Cache-Control', 'private, max-age=86400');
  if (mime) res.type(mime);
  if (download) res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(download)}"`);
  res.sendFile(storage.absolutePath(key));
}

router.get('/photos/:id/thumb', (req, res) => {
  const p = db.prepare('SELECT thumb_key FROM photos WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).end();
  sendImage(res, p.thumb_key, 'image/webp');
});

router.get('/photos/:id/raw', (req, res) => {
  const p = db.prepare('SELECT storage_key, mime FROM photos WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).end();
  sendImage(res, p.storage_key, p.mime);
});

export default router;
