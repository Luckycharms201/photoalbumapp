import { downloadZip } from 'client-zip';

// Folder titles carry characters ("|", ":") that Windows refuses in file names.
export const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

// Phones get a "Save to Photos" route through the share sheet: a ZIP on iOS
// lands in Files, where nobody finds it.
export const canShareFiles = () =>
  typeof navigator !== 'undefined' &&
  !!navigator.canShare &&
  window.matchMedia('(pointer: coarse)').matches &&
  navigator.canShare({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] });

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

// Fetches the originals into File objects for navigator.share(). Kept apart
// from the share call itself: the fetch outlives the tap's user activation,
// so the caller has to ask for a second tap before sharing.
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
