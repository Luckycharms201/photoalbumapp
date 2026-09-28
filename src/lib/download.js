import { downloadZip } from 'client-zip';

// Folder titles carry characters ("|", ":") that Windows refuses in file names.
export const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

// Where a phone can put photos in its gallery. A web page can't write there
// itself, so each platform gets the nearest route:
//   'photos'    iOS — the share sheet's "Save Images" is the only way into
//               Photos; a plain download lands in the Files app.
//   'downloads' Android — a downloaded image goes to Download/, which the
//               gallery shows as an album. Images inside a ZIP never do.
//   null        desktop — the ZIP is the better tool.
export function galleryTarget() {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch points give it away
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) {
    const probe = [new File([''], 'x.jpg', { type: 'image/jpeg' })];
    return navigator.canShare?.({ files: probe }) ? 'photos' : null;
  }
  return /Android/i.test(ua) ? 'downloads' : null;
}

function clickDownload(href, name) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// entries: [{ name, url, bytes }] — `name` may include a folder path.
// One file is downloaded as is; more are zipped in the browser, stored rather
// than recompressed, so the ZIP holds the exact original bytes. Where the
// browser can write straight to disk (Chromium) nothing is held in memory;
// elsewhere the ZIP is assembled as a Blob first.
export async function saveFiles(zipName, entries, onProgress) {
  if (entries.length === 1) {
    clickDownload(entries[0].url, entries[0].name.split('/').pop());
    return;
  }

  const fileName = `${safeName(zipName)}.zip`;
  let writable = null;
  if (window.showSaveFilePicker) {
    // Must be asked for while the click's user activation is still fresh.
    const handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }],
    });
    writable = await handle.createWritable();
  }

  let done = 0;
  async function* files() {
    for (const e of entries) {
      const res = await fetch(e.url);
      if (!res.ok) throw new Error(`No se pudo descargar ${e.name}`);
      yield { name: e.name, input: res, size: e.bytes };
      onProgress(++done);
    }
  }
  const zip = downloadZip(files());

  if (writable) {
    await zip.body.pipeTo(writable);
    return;
  }
  const url = URL.createObjectURL(await zip.blob());
  clickDownload(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Downloads each file on its own, a beat apart so the browser doesn't drop
// any. Chrome on Android asks once to allow multiple downloads.
export async function saveEach(entries, onProgress) {
  for (let i = 0; i < entries.length; i++) {
    clickDownload(entries[i].url, entries[i].name.split('/').pop());
    onProgress(i + 1);
    if (i < entries.length - 1) await new Promise((r) => setTimeout(r, 600));
  }
}

// Fetches the originals into File objects for navigator.share(). The fetch can
// outlive the tap's user activation, so callers try to share straight away and
// ask for a second tap only if the browser refuses (see shareOrWait).
export async function fetchAsFiles(entries, onProgress) {
  const files = [];
  for (const e of entries) {
    const res = await fetch(e.url);
    if (!res.ok) throw new Error(`No se pudo descargar ${e.name}`);
    const blob = await res.blob();
    files.push(new File([blob], e.name.split('/').pop(), { type: blob.type || 'image/jpeg' }));
    onProgress(files.length);
  }
  return files;
}

// Opens the share sheet. Returns 'shared', or 'retry' when it needs a fresh
// tap: either the browser refused because the tap's activation expired while
// the files were downloading, or the person closed the sheet.
export async function shareOrWait(files) {
  try {
    await navigator.share({ files });
    return 'shared';
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'AbortError') return 'retry';
    throw e;
  }
}
