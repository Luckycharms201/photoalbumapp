import { useEffect, useCallback, useState } from 'react';
import { fetchAsFiles, shareOrWait, galleryTarget } from '../lib/download.js';

const toPhotos = galleryTarget() === 'photos';

// iOS: the original goes into Photos through the share sheet. If the download
// outlasts the tap's activation, the button asks for one more tap.
function SaveToPhotos({ photo }) {
  const [state, setState] = useState({ status: 'idle', files: null });

  const open = async (files) => {
    const result = await shareOrWait(files);
    setState(result === 'retry' ? { status: 'ready', files } : { status: 'idle', files: null });
  };

  const onClick = async () => {
    if (state.files) return open(state.files);
    setState({ status: 'fetching', files: null });
    try {
      await open(await fetchAsFiles([{ name: photo.name, url: photo.downloadUrl }], () => {}));
    } catch {
      setState({ status: 'idle', files: null });
    }
  };

  return (
    <button className="btn small primary" onClick={onClick} disabled={state.status === 'fetching'}>
      {state.status === 'fetching' ? 'Preparando…' : state.status === 'ready' ? 'Toca para guardar' : 'Guardar en Fotos'}
    </button>
  );
}

// Full-size viewer with prev/next + keyboard nav. `photos` is the current list;
// `index` is the active item; the parent owns navigation state.
export default function Lightbox({ photos, index, onClose, onNavigate, downloadable }) {
  const photo = photos[index];

  const prev = useCallback(() => onNavigate((index - 1 + photos.length) % photos.length), [index, photos.length, onNavigate]);
  const next = useCallback(() => onNavigate((index + 1) % photos.length), [index, photos.length, onNavigate]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, prev, next]);

  if (!photo) return null;

  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lb-close" onClick={onClose} aria-label="Cerrar">✕</button>
      {photos.length > 1 && (
        <button className="lb-nav lb-prev" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Anterior">‹</button>
      )}
      <figure className="lb-figure" onClick={(e) => e.stopPropagation()}>
        {/* screen-sized preview to view; the button below gets the original */}
        <img src={photo.previewUrl ?? photo.rawUrl} alt={photo.name} />
        <figcaption>
          <span>{photo.name}</span>
          {downloadable && (toPhotos ? (
            // keyed so a half-finished save never carries over to the next photo
            <SaveToPhotos key={photo.downloadUrl} photo={photo} />
          ) : (
            <a className="btn small primary" href={photo.downloadUrl} download={photo.name}>
              Descargar original
            </a>
          ))}
        </figcaption>
      </figure>
      {photos.length > 1 && (
        <button className="lb-nav lb-next" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Siguiente">›</button>
      )}
    </div>
  );
}
