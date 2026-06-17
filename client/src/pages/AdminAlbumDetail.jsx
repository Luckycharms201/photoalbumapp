import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Lightbox from '../components/Lightbox.jsx';

const UPLOAD_CHUNK = 20; // files per request, to handle large batches gracefully
const ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif';

function looksLikeImage(file) {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

export default function AdminAlbumDetail() {
  const { id } = useParams();
  const fileInput = useRef(null);

  const [album, setAlbum] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null); // {uploaded,total,inflightPct,inflightCount}
  const [failed, setFailed] = useState([]);

  const [confirmPhoto, setConfirmPhoto] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [copied, setCopied] = useState(false);

  const loadPage = useCallback(async (p, append) => {
    const r = await api.getAlbum(id, p);
    setAlbum(r.album);
    setPhotos((prev) => (append ? [...prev, ...r.photos] : r.photos));
    setPage(r.page);
    setHasMore(r.hasMore);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    loadPage(1, false)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [loadPage]);

  async function reload() {
    await loadPage(1, false).catch((e) => setError(e.message));
  }

  // --- upload ---------------------------------------------------------------
  async function handleFiles(fileList) {
    const files = [...fileList].filter(looksLikeImage);
    const rejected = [...fileList].length - files.length;
    if (!files.length) {
      if (rejected) setError('Those files are not supported images.');
      return;
    }
    setError('');
    setFailed([]);
    setUploading(true);
    const allFailed = [];
    let uploaded = 0;
    try {
      for (let i = 0; i < files.length; i += UPLOAD_CHUNK) {
        const chunk = files.slice(i, i + UPLOAD_CHUNK);
        setProgress({ uploaded, total: files.length, inflightPct: 0, inflightCount: chunk.length });
        // eslint-disable-next-line no-await-in-loop
        const r = await api.uploadPhotos(id, chunk, (pct) =>
          setProgress({ uploaded, total: files.length, inflightPct: pct, inflightCount: chunk.length })
        );
        uploaded += chunk.length;
        if (r.failed?.length) allFailed.push(...r.failed);
      }
      setFailed(allFailed);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      setProgress(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  // --- album controls -------------------------------------------------------
  async function togglePublic() {
    try {
      const r = await api.updateAlbum(id, { isPublic: !album.isPublic });
      setAlbum((a) => ({ ...a, ...r.album }));
    } catch (err) {
      setError(err.message);
    }
  }
  async function rotateToken() {
    try {
      const r = await api.rotateToken(id);
      setAlbum((a) => ({ ...a, publicToken: r.publicToken, publicUrl: r.publicUrl }));
    } catch (err) {
      setError(err.message);
    }
  }
  async function copyLink() {
    await navigator.clipboard.writeText(album.publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  async function deletePhoto() {
    const p = confirmPhoto;
    setConfirmPhoto(null);
    try {
      await api.deletePhoto(p.id);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }
  async function setCover(photoId) {
    try {
      await api.setCover(id, photoId);
      setAlbum((a) => ({ ...a, coverPhotoId: photoId }));
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <div className="center muted">Loading album…</div>;
  if (!album) return <div className="alert error">{error || 'Album not found.'}</div>;

  const overallPct = progress
    ? Math.min(100, Math.round(((progress.uploaded + (progress.inflightPct / 100) * progress.inflightCount) / progress.total) * 100))
    : 0;

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/" className="muted">← All albums</Link>
      </div>

      <div className="page-head detail-head">
        <div>
          <h1>{album.title}</h1>
          <div className="muted small">{album.photoCount} photo{album.photoCount === 1 ? '' : 's'}</div>
        </div>
        <div className="detail-actions">
          <span className={`badge ${album.isPublic ? 'public' : 'private'}`}>
            {album.isPublic ? 'Public' : 'Private'}
          </span>
          <button className="btn ghost" onClick={togglePublic}>
            {album.isPublic ? 'Make private' : 'Make public'}
          </button>
        </div>
      </div>

      {album.isPublic && album.publicUrl && (
        <div className="share-box">
          <span className="muted small">Public link</span>
          <input readOnly value={album.publicUrl} onFocus={(e) => e.target.select()} />
          <button className="btn small primary" onClick={copyLink}>{copied ? 'Copied!' : 'Copy'}</button>
          <button className="btn small ghost" onClick={rotateToken} title="Invalidate the old link and generate a new one">
            New link
          </button>
        </div>
      )}

      {error && <div className="alert error">{error}</div>}

      {/* Upload zone */}
      <div
        className={`dropzone ${dragActive ? 'active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
      >
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p><strong>Drag &amp; drop photos here</strong></p>
        <p className="muted small">JPG, PNG, WebP, HEIC · up to 25 MB each</p>
        <button className="btn primary" disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? 'Uploading…' : 'Choose files'}
        </button>

        {progress && (
          <div className="progress-wrap">
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${overallPct}%` }} /></div>
            <div className="muted small">
              Uploaded {progress.uploaded} of {progress.total} · {overallPct}%
            </div>
          </div>
        )}
      </div>

      {failed.length > 0 && (
        <div className="alert error">
          {failed.length} file(s) failed:
          <ul>{failed.map((f, i) => <li key={i}>{f.name}: {f.error}</li>)}</ul>
        </div>
      )}

      {/* Photo grid */}
      {photos.length === 0 ? (
        <div className="empty">
          <p>This album is empty.</p>
          <p className="muted">Drop some photos above to get started.</p>
        </div>
      ) : (
        <>
          <div className="photo-grid">
            {photos.map((p, i) => (
              <div className="photo-tile" key={p.id}>
                <img
                  src={p.thumbUrl}
                  alt={p.name}
                  loading="lazy"
                  onClick={() => setLightboxIndex(i)}
                />
                <div className="photo-overlay">
                  <button
                    className={`icon-btn ${album.coverPhotoId === p.id ? 'on' : ''}`}
                    title="Set as cover"
                    onClick={() => setCover(p.id)}
                  >★</button>
                  <button className="icon-btn danger" title="Delete photo" onClick={() => setConfirmPhoto(p)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="center">
              <button className="btn ghost" onClick={() => loadPage(page + 1, true)}>Load more</button>
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
        />
      )}

      {confirmPhoto && (
        <ConfirmDialog
          title="Delete this photo?"
          message={`“${confirmPhoto.name}” will be permanently removed.`}
          confirmLabel="Delete photo"
          onConfirm={deletePhoto}
          onCancel={() => setConfirmPhoto(null)}
        />
      )}
    </div>
  );
}
