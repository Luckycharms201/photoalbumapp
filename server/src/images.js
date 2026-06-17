import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from './config.js';

const sharpLib = sharp;

function randomName() {
  return crypto.randomBytes(16).toString('hex');
}

// Convert HEIC/HEIF to a JPEG buffer. sharp's prebuilt binaries don't always
// ship HEIF support, so we use the pure-JS `heic-convert` as a reliable path.
async function heicToJpeg(buffer) {
  const { default: convert } = await import('heic-convert');
  return convert({ buffer, format: 'JPEG', quality: 0.92 });
}

/**
 * Process one uploaded image:
 *  - converts HEIC/HEIF -> JPEG
 *  - applies EXIF orientation (.rotate() with no args auto-rotates) and strips
 *    metadata so the stored image always displays upright
 *  - writes a full-res copy and a thumbnail to storage
 *
 * Returns metadata for the DB row.
 */
export async function processAndStore(storage, albumId, file) {
  let inputBuffer = file.buffer;
  let mime = file.mimetype;

  if (mime === 'image/heic' || mime === 'image/heif') {
    inputBuffer = await heicToJpeg(inputBuffer);
    mime = 'image/jpeg';
  }

  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const id = randomName();
  const dir = `albums/${albumId}`;
  const storageKey = `${dir}/${id}.${ext}`;
  const thumbKey = `${dir}/${id}.thumb.webp`;

  // Full-res: auto-rotate from EXIF so orientation is baked in, strip metadata.
  // resolveWithObject gives us the *output* dimensions (correct for rotated
  // images, where input metadata would report the pre-rotation size).
  const { data: fullBuffer, info } = await sharpLib(inputBuffer, { failOn: 'none' })
    .rotate()
    .toBuffer({ resolveWithObject: true });

  // Thumbnail: small, fast-loading webp.
  const thumbBuffer = await sharpLib(inputBuffer, { failOn: 'none' })
    .rotate()
    .resize({ width: config.uploads.thumbnailWidth, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  await storage.save(storageKey, fullBuffer);
  await storage.save(thumbKey, thumbBuffer);

  return {
    original_name: file.originalname,
    storage_key: storageKey,
    thumb_key: thumbKey,
    mime,
    size_bytes: fullBuffer.length,
    width: info.width ?? null,
    height: info.height ?? null,
  };
}
