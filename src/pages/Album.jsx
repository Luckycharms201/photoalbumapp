import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { downloadZip } from 'client-zip';
import Lightbox from '../components/Lightbox.jsx';
import AlbumGrid from '../components/AlbumGrid.jsx';
import { formatBytes, photoLabel } from '../lib/format.js';

// Zips the album's original photos in the browser. The files are stored, not
// recompressed, so the ZIP holds the exact bytes the camera wrote. Where the
// browser can write straight to disk (Chromium) nothing is held in memory;
// elsewhere the ZIP is assembled as a Blob first.
async function downloadAll(album, onProgress) {
  const zipName = `${album.title}.zip`;
  let writable = null;
  if (window.showSaveFilePicker) {
    // Must be asked for while the click's user activation is still fresh.
    const handle = await window.showSaveFilePicker({
      suggestedName: zipName,
      types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }],
    });
    writable = await handle.createWritable();
  }

  let done = 0;
  async function* files() {
    for (const p of album.photos) {
      const res = await fetch(p.downloadUrl);
      if (!res.ok) throw new Error(`No se pudo descargar ${p.name}`);
      yield { name: p.name, input: res, size: p.bytes };
      onProgress(++done);
    }
  }
  const zip = downloadZip(files());

  if (writable) {
    await zip.body.pipeTo(writable);
    return;
  }
  const url = URL.createObjectURL(await zip.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function Album() {
  const { token } = useParams();
  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [zipProgress, setZipProgress] = useState(null);
  const [zipError, setZipError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    setLightboxIndex(null);
    fetch(`/gallery/data/${token}.json`)
      .then((r) => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then(setAlbum)
      .catch(() => setError('Este álbum es privado o el link no es válido.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="center muted">Cargando…</div>;

  if (error || !album) {
    return (
      <div className="empty">
        <h2>Álbum no disponible</h2>
        <p className="muted">{error}</p>
        <p><Link className="btn ghost" to="/">← Volver a los álbumes</Link></p>
      </div>
    );
  }

  const back = album.parent
    ? <Link to={`/album/${album.parent.token}`} className="muted">← {album.parent.title}</Link>
    : <Link to="/" className="muted">← Todos los álbumes</Link>;
  const size = formatBytes(album.bytes);
  const stats = `${album.count} ${photoLabel(album.count).toLowerCase()}${size ? ` · ${size}` : ''}`;

  if (album.kind === 'collection') {
    return (
      <div className="public-view">
        <div className="breadcrumb">{back}</div>
        <div className="page-head detail-head">
          <div>
            <h1>{album.title}</h1>
            <div className="muted small">{album.albums.length} carpetas · {stats}</div>
          </div>
        </div>
        <AlbumGrid albums={album.albums} />
      </div>
    );
  }

  const photos = album.photos || [];
  const zipping = zipProgress != null;

  const onDownloadAll = async () => {
    setZipError('');
    setZipProgress(0);
    try {
      await downloadAll(album, setZipProgress);
    } catch (e) {
      if (e.name !== 'AbortError') setZipError(e.message || 'No se pudo generar el ZIP.');
    } finally {
      setZipProgress(null);
    }
  };

  return (
    <div className="public-view">
      <div className="breadcrumb">{back}</div>
      <div className="page-head detail-head">
        <div>
          <h1>{album.title}</h1>
          <div className="muted small">{stats}</div>
        </div>
        {photos.length > 0 && (
          <button className="btn primary" onClick={onDownloadAll} disabled={zipping}>
            {zipping ? `Preparando ZIP… ${zipProgress}/${photos.length}` : '⬇ Descargar todas (ZIP)'}
          </button>
        )}
      </div>
      {zipError && <div className="alert error">{zipError}</div>}

      {photos.length === 0 ? (
        <div className="empty"><p>Este álbum no tiene fotos.</p></div>
      ) : (
        <div className="photo-grid">
          {photos.map((p, i) => (
            <div className="photo-tile" key={p.rawUrl}>
              <img src={p.thumbUrl} alt={p.name} loading="lazy" onClick={() => setLightboxIndex(i)} />
              <div className="photo-overlay">
                <a
                  className="icon-btn"
                  href={p.downloadUrl}
                  download={p.name}
                  title="Descargar en calidad completa"
                  onClick={(e) => e.stopPropagation()}
                >⬇</a>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightboxIndex != null && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          onNavigate={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          downloadable
        />
      )}
    </div>
  );
}
