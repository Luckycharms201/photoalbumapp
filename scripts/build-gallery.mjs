// Static gallery builder.
//
// Reads source albums from /albums/<name>/ (full-size photos you commit).
// A top-level folder is either
//   - an ALBUM: photos directly inside it, or
//   - a COLLECTION: subfolders with photos inside them (one level deep). Each
//     subfolder becomes an album whose title is the subfolder name as-is, so
//     it sorts and reads exactly like the folder on disk.
//
// For each album it writes to the output dir (default dist/gallery):
//   thumbs/<token>/*.webp   small webp thumbnails for the grid
//   previews/<token>/*.webp screen-sized webp for the lightbox
//   photos/<token>/*.<ext>  the ORIGINAL file, byte for byte (full quality)
//   data/<token>.json       photo list for the album page
// plus data/<token>.json for each collection, and a top-level manifest.json
// listing only the PUBLIC albums/collections.
//
// There are no build-time ZIPs: Cloudflare Pages caps files at 25 MiB, which a
// real event album blows past. "Download all" zips the originals in the browser.
//
// Tokens are derived deterministically from the folder path, so the shareable
// /album/<token> link is stable across builds with nothing to persist.
// Renaming a folder changes its link (by design). Put `"unlisted": true` in an
// album's album.json to keep it out of manifest.json (reachable only by link).

import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import sharp from 'sharp';
import convert from 'heic-convert';

const ROOT = process.cwd();
const ALBUMS_DIR = path.join(ROOT, 'albums');
const PUBLIC_PREFIX = '/gallery'; // URL prefix (served from dist/ or public/)
const THUMB_WIDTH = 480;
const PREVIEW_SIZE = 1920;
const IMAGE_RE = /\.(jpe?g|png|webp|heic|heif)$/i;
const CONCURRENCY = Math.max(2, Math.min(8, os.cpus().length));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const OUT_DIR = path.resolve(ROOT, arg('--out', 'dist/gallery'));

function tokenFor(folderPath) {
  return crypto.createHash('sha256').update(`album:${folderPath}`).digest('hex').slice(0, 32);
}

function prettify(name) {
  return name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const byName = (a, b) => a.localeCompare(b, 'es', { numeric: true });

async function readAlbumMeta(dir, fallbackTitle) {
  let meta = {};
  try {
    meta = JSON.parse(await fsp.readFile(path.join(dir, 'album.json'), 'utf8'));
  } catch {
    /* optional file */
  }
  return {
    title: meta.title || fallbackTitle,
    subtitle: typeof meta.subtitle === 'string' && meta.subtitle.trim() ? meta.subtitle.trim() : undefined,
    unlisted: !!meta.unlisted,
    order: Number.isFinite(meta.order) ? meta.order : null,
  };
}

async function listDir(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  return {
    images: entries.filter((e) => e.isFile() && IMAGE_RE.test(e.name) && !e.name.startsWith('.')).map((e) => e.name).sort(byName),
    dirs: entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort(byName),
  };
}

// Run `fn` over `items` with bounded parallelism, preserving order.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function processImage(filePath) {
  const original = await fsp.readFile(filePath);
  let ext = path.extname(filePath).slice(1).toLowerCase();
  let full = original;

  // HEIC doesn't open in most browsers, so that one format is converted.
  // Everything else is published exactly as it came off the camera.
  if (ext === 'heic' || ext === 'heif') {
    full = Buffer.from(await convert({ buffer: original, format: 'JPEG', quality: 0.95 }));
    ext = 'jpg';
  } else if (ext === 'jpeg') {
    ext = 'jpg';
  }

  const meta = await sharp(full, { failOn: 'none' }).metadata();
  const rotated = (meta.orientation ?? 1) >= 5; // EXIF 5–8 swap width/height
  const width = (rotated ? meta.height : meta.width) ?? null;
  const height = (rotated ? meta.width : meta.height) ?? null;

  const thumb = await sharp(full, { failOn: 'none' })
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  const preview = await sharp(full, { failOn: 'none' })
    .rotate()
    .resize({ width: PREVIEW_SIZE, height: PREVIEW_SIZE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const hash = crypto.createHash('sha1').update(full).digest('hex').slice(0, 16);
  return { full, thumb, preview, ext, hash, width, height };
}

// Process one folder of photos into an album. Returns null if nothing usable.
async function buildAlbum({ dir, files, token, title, subtitle, label, parent }) {
  for (const sub of ['thumbs', 'previews', 'photos']) {
    await fsp.mkdir(path.join(OUT_DIR, sub, token), { recursive: true });
  }

  const results = await mapLimit(files, CONCURRENCY, async (file) => {
    try {
      const r = await processImage(path.join(dir, file));
      const fullName = `${r.hash}.${r.ext}`;
      const webpName = `${r.hash}.webp`;
      await fsp.writeFile(path.join(OUT_DIR, 'photos', token, fullName), r.full);
      await fsp.writeFile(path.join(OUT_DIR, 'thumbs', token, webpName), r.thumb);
      await fsp.writeFile(path.join(OUT_DIR, 'previews', token, webpName), r.preview);

      const rawUrl = `${PUBLIC_PREFIX}/photos/${token}/${fullName}`;
      // HEIC was converted, so its download name has to say .jpg too.
      const name = /\.hei[cf]$/i.test(file) ? file.replace(/\.hei[cf]$/i, '.jpg') : file;
      return {
        name,
        width: r.width,
        height: r.height,
        bytes: r.full.length,
        thumbUrl: `${PUBLIC_PREFIX}/thumbs/${token}/${webpName}`,
        previewUrl: `${PUBLIC_PREFIX}/previews/${token}/${webpName}`,
        rawUrl,
        downloadUrl: rawUrl,
      };
    } catch (err) {
      console.warn(`  (fail) ${label}/${file}: ${err.message}`);
      return null;
    }
  });

  const photos = results.filter(Boolean);
  if (!photos.length) return null;

  const bytes = photos.reduce((sum, p) => sum + p.bytes, 0);
  const albumData = { kind: 'album', title, subtitle, token, parent, count: photos.length, bytes, photos };
  await fsp.writeFile(path.join(OUT_DIR, 'data', `${token}.json`), JSON.stringify(albumData));
  return { token, title, subtitle, count: photos.length, bytes, cover: photos[0].thumbUrl };
}

async function main() {
  await fsp.rm(OUT_DIR, { recursive: true, force: true });
  await fsp.mkdir(path.join(OUT_DIR, 'data'), { recursive: true });

  let folders = [];
  try {
    folders = (await listDir(ALBUMS_DIR)).dirs;
  } catch {
    console.warn(`No /albums directory found at ${ALBUMS_DIR} — building an empty gallery.`);
  }

  const manifestAlbums = [];
  let totalPhotos = 0;

  for (const folder of folders) {
    const dir = path.join(ALBUMS_DIR, folder);
    const token = tokenFor(folder);
    const meta = await readAlbumMeta(dir, prettify(folder));
    const { images, dirs } = await listDir(dir);
    const visibility = meta.unlisted ? '(unlisted)' : '(public)  ';

    let entry = null;

    if (images.length) {
      const album = await buildAlbum({ dir, files: images, token, title: meta.title, subtitle: meta.subtitle, label: folder });
      if (album) {
        entry = { kind: 'album', ...album };
        console.log(`  ${visibility} ${meta.title} — ${album.count} photo(s)`);
        totalPhotos += album.count;
      }
    } else if (dirs.length) {
      const children = [];
      for (const child of dirs) {
        const childDir = path.join(dir, child);
        const { images: childImages } = await listDir(childDir);
        if (!childImages.length) continue;
        const album = await buildAlbum({
          dir: childDir,
          files: childImages,
          token: tokenFor(`${folder}/${child}`),
          title: child,
          label: `${folder}/${child}`,
          parent: { token, title: meta.title },
        });
        if (album) {
          children.push(album);
          console.log(`  ${visibility} ${meta.title} / ${child} — ${album.count} photo(s)`);
          totalPhotos += album.count;
        }
      }
      if (children.length) {
        const count = children.reduce((s, a) => s + a.count, 0);
        const bytes = children.reduce((s, a) => s + a.bytes, 0);
        const collection = { kind: 'collection', token, title: meta.title, subtitle: meta.subtitle, count, bytes, albums: children };
        await fsp.writeFile(path.join(OUT_DIR, 'data', `${token}.json`), JSON.stringify(collection));
        entry = { kind: 'collection', token, title: meta.title, subtitle: meta.subtitle, count, bytes, albumCount: children.length, cover: children[0].cover };
      }
    }

    if (!entry) {
      console.warn(`  (skip) "${folder}" has no images`);
      continue;
    }
    if (!meta.unlisted) manifestAlbums.push({ ...entry, order: meta.order });
  }

  manifestAlbums.sort((a, b) => {
    if (a.order != null && b.order != null) return a.order - b.order;
    if (a.order != null) return -1;
    if (b.order != null) return 1;
    return a.title.localeCompare(b.title);
  });

  await fsp.writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), albums: manifestAlbums })
  );

  console.log(
    `\nGallery built → ${path.relative(ROOT, OUT_DIR)} · ` +
      `${manifestAlbums.length} public album(s), ${totalPhotos} photo(s) total.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
