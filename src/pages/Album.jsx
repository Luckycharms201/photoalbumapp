import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Lightbox from '../components/Lightbox.jsx';

export default function Album() {
  const { token } = useParams();
  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/gallery/data/${token}.json`)
      .then((r) => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then(setAlbum)
      .catch(() => setError('This album is private or the link is invalid.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="center muted">Loading…</div>;

  if (error || !album) {
    return (
      <div className="empty">
        <h2>Album unavailable</h2>
        <p className="muted">{error}</p>
        <p><Link className="btn ghost" to="/">← Back to albums</Link></p>
      </div>
    );
  }

  const photos = album.photos || [];

  return (
    <div className="public-view">
      <div className="breadcrumb"><Link to="/" className="muted">← All albums</Link></div>
      <div className="page-head detail-head">
        <div>
          <h1>{album.title}</h1>
          <div className="muted small">{album.count} photo{album.count === 1 ? '' : 's'}</div>
        </div>
        {photos.length > 0 && (
          <a className="btn primary" href={album.zipUrl} download>⬇ Download all (ZIP)</a>
        )}
      </div>

      {photos.length === 0 ? (
        <div className="empty"><p>This album has no photos.</p></div>
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
                  title="Download"
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
