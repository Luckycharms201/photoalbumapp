import { Router } from 'express';
import archiver from 'archiver';
import { db } from '../db.js';
import { storage } from '../storage/localStorage.js';
import { config } from '../config.js';

const router = Router();

// Resolve a public album strictly by token AND is_public=1. A private or
// unknown token yields 404 — private albums are never reachable here, which is
// the server-side enforcement of "public read-only" access.
function getPublicAlbum(token) {
  return db
    .prepare('SELECT * FROM albums WHERE public_token = ? AND is_public = 1')
    .get(token);
}

function serializePhotoPublic(token, p) {
  return {
    id: p.id,
    name: p.original_name,
    width: p.width,
    height: p.height,
    thumbUrl: `/api/public/albums/${token}/photos/${p.id}/thumb`,
    rawUrl: `/api/public/albums/${token}/photos/${p.id}/raw`,
    downloadUrl: `/api/public/albums/${token}/photos/${p.id}/download`,
  };
}

// GET /api/public/albums/:token?page=1
router.get('/albums/:token', (req, res) => {
  const album = getPublicAlbum(req.params.token);
  if (!album) return res.status(404).json({ error: 'Album not found.' });

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
    album: {
      title: album.title,
      token: album.public_token,
      photoCount: total,
      downloadUrl: `/api/public/albums/${album.public_token}/download`,
    },
    photos: photos.map((p) => serializePhotoPublic(album.public_token, p)),
    page,
    pageSize,
    total,
    hasMore: offset + photos.length < total,
  });
});

// --- image serving (validates the photo belongs to the public album) --------
function getPublicPhoto(token, photoId) {
  const album = getPublicAlbum(token);
  if (!album) return null;
  return db.prepare('SELECT * FROM photos WHERE id = ? AND album_id = ?').get(photoId, album.id);
}

router.get('/albums/:token/photos/:id/thumb', (req, res) => {
  const p = getPublicPhoto(req.params.token, req.params.id);
  if (!p) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.type('image/webp');
  res.sendFile(storage.absolutePath(p.thumb_key));
});

router.get('/albums/:token/photos/:id/raw', (req, res) => {
  const p = getPublicPhoto(req.params.token, req.params.id);
  if (!p) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.type(p.mime);
  res.sendFile(storage.absolutePath(p.storage_key));
});

router.get('/albums/:token/photos/:id/download', (req, res) => {
  const p = getPublicPhoto(req.params.token, req.params.id);
  if (!p) return res.status(404).end();
  res.type(p.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(p.original_name)}"`);
  res.sendFile(storage.absolutePath(p.storage_key));
});

// GET /api/public/albums/:token/download  — stream the whole album as a ZIP.
router.get('/albums/:token/download', (req, res) => {
  const album = getPublicAlbum(req.params.token);
  if (!album) return res.status(404).json({ error: 'Album not found.' });

  const photos = db.prepare('SELECT * FROM photos WHERE album_id = ?').all(album.id);
  if (!photos.length) return res.status(404).json({ error: 'Album is empty.' });

  const safeName = album.title.replace(/[^\w.-]+/g, '_') || 'album';
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => {
    // Headers may already be sent mid-stream; just terminate the response.
    if (!res.headersSent) res.status(500).json({ error: 'Failed to build ZIP.' });
    res.destroy(err);
  });
  archive.pipe(res);

  // De-duplicate filenames within the zip (originals can collide).
  const seen = new Map();
  for (const p of photos) {
    let name = p.original_name;
    if (seen.has(name)) {
      const n = seen.get(name) + 1;
      seen.set(name, n);
      const dot = name.lastIndexOf('.');
      name = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
    } else {
      seen.set(name, 0);
    }
    archive.file(storage.absolutePath(p.storage_key), { name });
  }
  archive.finalize();
});

export default router;
