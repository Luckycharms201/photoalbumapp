import { useEffect, useCallback } from 'react';

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
          {downloadable && (
            <a className="btn small primary" href={photo.downloadUrl} download={photo.name}>
              Descargar original
            </a>
          )}
        </figcaption>
      </figure>
      {photos.length > 1 && (
        <button className="lb-nav lb-next" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Siguiente">›</button>
      )}
    </div>
  );
}
