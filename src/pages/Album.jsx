import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Lightbox from '../components/Lightbox.jsx';
import AlbumGrid from '../components/AlbumGrid.jsx';
import SelectionBar from '../components/SelectionBar.jsx';
import useSelection from '../lib/useSelection.js';
import { saveFiles, safeName } from '../lib/download.js';
import { formatBytes, photoLabel } from '../lib/format.js';

const fetchData = (token) =>
  fetch(`/gallery/data/${token}.json`).then((r) => {
    if (!r.ok) throw new Error('not found');
    return r.json();
  });

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function Album() {
  const { token } = useParams();
  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetchData(token)
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

  // keyed by token so selection state never leaks from one album to the next
  return album.kind === 'collection'
    ? <CollectionView key={album.token} collection={album} />
    : <PhotoAlbumView key={album.token} album={album} />;
}

function Header({ item, stats, children }) {
  const back = item.parent
    ? <Link to={`/album/${item.parent.token}`} className="muted">← {item.parent.title}</Link>
    : <Link to="/" className="muted">← Todos los álbumes</Link>;
  return (
    <>
      <div className="breadcrumb">{back}</div>
      <div className="page-head detail-head">
        <div>
          <h1>{item.title}</h1>
          <div className="muted small">{stats}</div>
        </div>
        <div className="head-actions">{children}</div>
      </div>
    </>
  );
}

function SelectToggle({ sel, allKeys }) {
  if (!sel.selecting) {
    return <button className="btn" onClick={sel.start}>Seleccionar</button>;
  }
  const all = sel.selected.size === allKeys.length;
  return (
    <>
      <button className="btn" onClick={() => (all ? sel.clear() : sel.setAll(allKeys))}>
        {all ? 'Quitar todas' : 'Seleccionar todas'}
      </button>
      <button className="btn ghost" onClick={sel.stop}>Cancelar</button>
    </>
  );
}

function CollectionView({ collection }) {
  const sel = useSelection();
  const [childData, setChildData] = useState({});
  const requested = useRef(new Set());
  const albums = collection.albums;
  const size = formatBytes(collection.bytes);

  // The photo lists are only needed to download, so fetch them on first use.
  useEffect(() => {
    if (!sel.selecting) return;
    for (const a of albums) {
      if (requested.current.has(a.token)) continue;
      requested.current.add(a.token);
      fetchData(a.token)
        .then((d) => setChildData((prev) => ({ ...prev, [a.token]: d })))
        .catch(() => requested.current.delete(a.token));
    }
  }, [sel.selecting, albums]);

  const chosen = albums.filter((a) => sel.selected.has(a.token));
  const entries = chosen.every((a) => childData[a.token])
    ? chosen.flatMap((a) =>
        childData[a.token].photos.map((p) => ({ name: `${safeName(a.title)}/${p.name}`, url: p.downloadUrl, bytes: p.bytes })))
    : null;
  const photoCount = chosen.reduce((s, a) => s + a.count, 0);

  return (
    <div className={`public-view${sel.selecting ? ' has-selection-bar' : ''}`}>
      <Header item={collection} stats={`${albums.length} carpetas · ${plural(collection.count, 'foto', 'fotos')}${size ? ` · ${size}` : ''}`}>
        <SelectToggle sel={sel} allKeys={albums.map((a) => a.token)} />
      </Header>
      {sel.selecting && <p className="muted small select-hint">Toca las carpetas que quieras descargar.</p>}

      <AlbumGrid albums={albums} selecting={sel.selecting} selected={sel.selected} onToggle={sel.toggle} />

      {sel.selecting && (
        <SelectionBar
          summary={chosen.length
            ? `${plural(chosen.length, 'carpeta', 'carpetas')} · ${plural(photoCount, 'foto', 'fotos')}`
            : 'Ninguna carpeta seleccionada'}
          bytes={chosen.reduce((s, a) => s + a.bytes, 0)}
          zipName={chosen.length === albums.length ? collection.title : `${collection.title} (${plural(chosen.length, 'carpeta', 'carpetas')})`}
          entries={entries}
          onClear={sel.clear}
        />
      )}
    </div>
  );
}

function PhotoAlbumView({ album }) {
  const sel = useSelection();
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [zipProgress, setZipProgress] = useState(null);
  const [zipError, setZipError] = useState('');

  const photos = album.photos || [];
  const size = formatBytes(album.bytes);
  const all = useMemo(() => photos.map((p) => ({ name: p.name, url: p.downloadUrl, bytes: p.bytes })), [photos]);
  const chosen = photos.filter((p) => sel.selected.has(p.rawUrl));
  const zipping = zipProgress != null;

  const onDownloadAll = async () => {
    setZipError('');
    setZipProgress(0);
    try {
      await saveFiles(album.title, all, setZipProgress);
    } catch (e) {
      if (e.name !== 'AbortError') setZipError(e.message || 'No se pudo generar el ZIP.');
    } finally {
      setZipProgress(null);
    }
  };

  const onTile = (p, i) => (sel.selecting ? sel.toggle(p.rawUrl) : setLightboxIndex(i));

  return (
    <div className={`public-view${sel.selecting ? ' has-selection-bar' : ''}`}>
      <Header item={album} stats={`${plural(album.count, 'foto', 'fotos')}${size ? ` · ${size}` : ''}`}>
        {photos.length > 0 && <SelectToggle sel={sel} allKeys={photos.map((p) => p.rawUrl)} />}
        {photos.length > 0 && !sel.selecting && (
          <button className="btn primary" onClick={onDownloadAll} disabled={zipping}>
            {zipping ? `Preparando ZIP… ${zipProgress}/${photos.length}` : '⬇ Descargar todas (ZIP)'}
          </button>
        )}
      </Header>
      {zipError && <div className="alert error">{zipError}</div>}
      {sel.selecting && <p className="muted small select-hint">Toca las fotos que quieras descargar.</p>}

      {photos.length === 0 ? (
        <div className="empty"><p>Este álbum no tiene fotos.</p></div>
      ) : (
        <div className={`photo-grid${sel.selecting ? ' is-selecting' : ''}`}>
          {photos.map((p, i) => {
            const on = sel.selected.has(p.rawUrl);
            return (
              <div className={`photo-tile${on ? ' is-selected' : ''}`} key={p.rawUrl}>
                <img
                  src={p.thumbUrl}
                  alt={p.name}
                  loading="lazy"
                  draggable={false}
                  onClick={() => onTile(p, i)}
                />
                {/* desktop: hovering offers the check, and ticking it starts selecting */}
                <button
                  type="button"
                  className="select-check"
                  aria-pressed={on}
                  aria-label={on ? `Quitar ${p.name}` : `Seleccionar ${p.name}`}
                  onClick={() => { sel.start(); sel.toggle(p.rawUrl); }}
                >{on ? '✓' : ''}</button>
                {!sel.selecting && (
                  <div className="photo-overlay">
                    <a
                      className="icon-btn"
                      href={p.downloadUrl}
                      download={p.name}
                      title="Descargar en calidad completa"
                    >⬇</a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sel.selecting && (
        <SelectionBar
          summary={chosen.length ? plural(chosen.length, 'foto seleccionada', 'fotos seleccionadas') : 'Ninguna foto seleccionada'}
          bytes={chosen.reduce((s, p) => s + p.bytes, 0)}
          zipName={`${album.title} (${plural(chosen.length, 'foto', 'fotos')})`}
          entries={chosen.map((p) => ({ name: p.name, url: p.downloadUrl, bytes: p.bytes }))}
          onClear={sel.clear}
        />
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
