// Static gallery builder.
//
// Reads source albums from /albums/<name>/ (full-size photos you commit),
// then for each album writes to the output dir (default dist/gallery):
//   thumbs/<token>/*.webp   small webp thumbnails (EXIF baked in)
//   photos/<token>/*.<ext>  full-size images (EXIF baked in, HEIC -> JPEG)
//   zips/<token>.zip        whole-album download
//   data/<token>.json       photo list for the album page
// and a top-level manifest.json listing only the PUBLIC albums.
//
// The album token is derived deterministically from the folder name, so the
// shareable /album/<token> link is stable across builds with nothing to persist.
// Renaming a folder changes its link (by design). Put `"unlisted": true` in an
// album's album.json to keep it out of manifest.json (reachable only by link).

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import archiver from 'archiver';
import convert from 'heic-convert';

const ROOT = process.cwd();
const ALBUMS_DIR = path.join(ROOT, 'albums');
const PUBLIC_PREFIX = '/gallery'; // URL prefix (served from dist/ or public/)
const THUMB_WIDTH = 480;
const IMAGE_RE = /\.(jpe?g|png|webp|heic|heif)$/i;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const OUT_DIR = path.resolve(ROOT, arg('--out', 'dist/gallery'));

function tokenFor(folderName) {
  return crypto.createHash('sha256').update(`album:${folderName}`).digest('hex').slice(0, 32);
}

function prettify(name) {
  return name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function readAlbumMeta(dir, folderName) {
  let meta = {};
  try {
    meta = JSON.parse(await fsp.readFile(path.join(dir, 'album.json'), 'utf8'));
  } catch {
    /* optional file */
  }
  return {
    title: meta.title || prettify(folderName),
    unlisted: !!meta.unlisted,
    order: Number.isFinite(meta.order) ? meta.order : null,
  };
}

function zipAlbum(zipPath, entries) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    const seen = new Map();
    for (const e of entries) {
      let name = e.name;
      if (seen.has(name)) {
        const n = seen.get(name) + 1;
        seen.set(name, n);
        const dot = name.lastIndexOf('.');
        name = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
      } else {
        seen.set(name, 0);
      }
      archive.file(e.path, { name });
    }
    archive.finalize();
  });
}

async function processImage(filePath, mime) {
  let input = await fsp.readFile(filePath);
  let ext = path.extname(filePath).slice(1).toLowerCase();

  if (mime === 'heic' || mime === 'heif') {
    input = Buffer.from(await convert({ buffer: input, format: 'JPEG', quality: 0.92 }));
    ext = 'jpg';
  } else if (ext === 'jpeg') {
    ext = 'jpg';
  }

  // Full-size: auto-rotate from EXIF (baked in), strip metadata.
  const { data: full, info } = await sharp(input, { failOn: 'none' })
    .rotate()
    .toBuffer({ resolveWithObject: true });

  const thumb = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  const hash = crypto.createHash('sha1').update(full).digest('hex').slice(0, 16);
  return { full, thumb, ext, hash, width: info.width ?? null, height: info.height ?? null };
}

async function main() {
  await fsp.rm(OUT_DIR, { recursive: true, force: true });
  for (const sub of ['data', 'thumbs', 'photos', 'zips']) {
    await fsp.mkdir(path.join(OUT_DIR, sub), { recursive: true });
  }

  let folders = [];
  try {
    folders = (await fsp.readdir(ALBUMS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((n) => !n.startsWith('.'));
  } catch {
    console.warn(`No /albums directory found at ${ALBUMS_DIR} — building an empty gallery.`);
  }

  const manifestAlbums = [];
  let totalPhotos = 0;

  for (const folder of folders.sort()) {
    const dir = path.join(ALBUMS_DIR, folder);
    const token = tokenFor(folder);
    const meta = await readAlbumMeta(dir, folder);

    const files = (await fsp.readdir(dir))
      .filter((f) => IMAGE_RE.test(f) && !f.startsWith('.'))
      .sort();

    if (!files.length) {
      console.warn(`  (skip) "${folder}" has no images`);
      continue;
    }

    await fsp.mkdir(path.join(OUT_DIR, 'thumbs', token), { recursive: true });
    await fsp.mkdir(path.join(OUT_DIR, 'photos', token), { recursive: true });

    const photos = [];
    const zipEntries = [];
    for (const file of files) {
      const mime = path.extname(file).slice(1).toLowerCase();
      try {
        const r = await processImage(path.join(dir, file), mime);
        const fullName = `${r.hash}.${r.ext}`;
        const thumbName = `${r.hash}.webp`;
        const fullPath = path.join(OUT_DIR, 'photos', token, fullName);
        await fsp.writeFile(fullPath, r.full);
        await fsp.writeFile(path.join(OUT_DIR, 'thumbs', token, thumbName), r.thumb);

        const rawUrl = `${PUBLIC_PREFIX}/photos/${token}/${fullName}`;
        photos.push({
          name: file,
          width: r.width,
          height: r.height,
          thumbUrl: `${PUBLIC_PREFIX}/thumbs/${token}/${thumbName}`,
          rawUrl,
          downloadUrl: rawUrl,
        });
        zipEntries.push({ path: fullPath, name: file });
      } catch (err) {
        console.warn(`  (fail) ${folder}/${file}: ${err.message}`);
      }
    }

    if (!photos.length) continue;

    await zipAlbum(path.join(OUT_DIR, 'zips', `${token}.zip`), zipEntries);

    const albumData = {
      title: meta.title,
      token,
      count: photos.length,
      zipUrl: `${PUBLIC_PREFIX}/zips/${token}.zip`,
      photos,
    };
    await fsp.writeFile(path.join(OUT_DIR, 'data', `${token}.json`), JSON.stringify(albumData));

    totalPhotos += photos.length;
    console.log(`  ${meta.unlisted ? '(unlisted)' : '(public)  '} ${meta.title} — ${photos.length} photo(s)`);

    if (!meta.unlisted) {
      manifestAlbums.push({
        token,
        title: meta.title,
        count: photos.length,
        cover: photos[0].thumbUrl,
        order: meta.order,
      });
    }
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
