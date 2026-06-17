import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import Lightbox from '../components/Lightbox.jsx';

export default function PublicAlbum() {
  const { token } = useParams();
  const [album, setAlbum] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const loadPage = useCallback(async (p, append) => {
    const r = await api.getPublicAlbum(token, p);
    setAlbum(r.album);
    setPhotos((prev) => (append ? [...prev, ...r.photos] : r.photos));
    setPage(r.page);
    setHasMore(r.hasMore);
  }, [token]);

  useEffect(() => {
    setLoading(true);
    loadPage(1, false)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [loadPage]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      await loadPage(page + 1, true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) return <div className="center muted">Loading…</div>;

  if (error || !album) {
    return (
      <div className="empty">
        <h2>Album unavailable</h2>
        <p className="muted">{error || 'This album is private or the link is invalid.'}</p>
      </div>
    );
  }

  return (
    <div className="public-view">
      <div className="page-head detail-head">
        <div>
          <h1>{album.title}</h1>
          <div className="muted small">{album.photoCount} photo{album.photoCount === 1 ? '' : 's'}</div>
        </div>
        {album.photoCount > 0 && (
          <a className="btn primary" href={album.downloadUrl} download>
            ⬇ Download all (ZIP)
          </a>
        )}
      </div>

      {photos.length === 0 ? (
        <div className="empty">
          <p>This album has no photos yet.</p>
        </div>
      ) : (
        <>
          <div className="photo-grid">
            {photos.map((p, i) => (
              <div className="photo-tile" key={p.id}>
                <img src={p.thumbUrl} alt={p.name} loading="lazy" onClick={() => setLightboxIndex(i)} />
                <div className="photo-overlay">
                  <a className="icon-btn" href={p.downloadUrl} download title="Download" onClick={(e) => e.stopPropagation()}>⬇</a>
                </div>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="center">
              <button className="btn ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
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
