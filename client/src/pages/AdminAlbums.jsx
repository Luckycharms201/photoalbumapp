import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

export default function AdminAlbums() {
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState(null); // album pending deletion
  const [copied, setCopied] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await api.listAlbums();
      setAlbums(r.albums);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await api.createAlbum(newTitle.trim());
      setNewTitle('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function rename(album) {
    const title = window.prompt('Rename album', album.title);
    if (title == null || !title.trim() || title === album.title) return;
    try {
      await api.updateAlbum(album.id, { title: title.trim() });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function togglePublic(album) {
    try {
      await api.updateAlbum(album.id, { isPublic: !album.isPublic });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function copyLink(album) {
    if (!album.publicUrl) return;
    await navigator.clipboard.writeText(album.publicUrl);
    setCopied(album.id);
    setTimeout(() => setCopied(null), 1500);
  }

  async function doDelete() {
    const album = confirm;
    setConfirm(null);
    try {
      await api.deleteAlbum(album.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Your albums</h1>
      </div>

      <form className="create-row" onSubmit={create}>
        <input
          placeholder="New album title…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button className="btn primary" disabled={creating || !newTitle.trim()}>
          {creating ? 'Creating…' : 'Create album'}
        </button>
      </form>

      {error && <div className="alert error">{error}</div>}

      {loading ? (
        <div className="center muted">Loading albums…</div>
      ) : albums.length === 0 ? (
        <div className="empty">
          <p>No albums yet.</p>
          <p className="muted">Create your first album above, then open it to upload photos.</p>
        </div>
      ) : (
        <div className="album-grid">
          {albums.map((a) => (
            <div className="album-card" key={a.id}>
              <Link to={`/albums/${a.id}`} className="album-cover">
                {a.coverPhotoId ? (
                  <img src={`/api/admin/photos/${a.coverPhotoId}/thumb`} alt={a.title} />
                ) : (
                  <div className="cover-empty">No photos</div>
                )}
                <span className={`badge ${a.isPublic ? 'public' : 'private'}`}>
                  {a.isPublic ? 'Public' : 'Private'}
                </span>
              </Link>
              <div className="album-body">
                <Link to={`/albums/${a.id}`} className="album-title">{a.title}</Link>
                <div className="muted small">{a.photoCount} photo{a.photoCount === 1 ? '' : 's'}</div>
                <div className="album-actions">
                  <button className="btn small ghost" onClick={() => rename(a)}>Rename</button>
                  <button className="btn small ghost" onClick={() => togglePublic(a)}>
                    {a.isPublic ? 'Make private' : 'Make public'}
                  </button>
                  {a.isPublic && (
                    <button className="btn small ghost" onClick={() => copyLink(a)}>
                      {copied === a.id ? 'Copied!' : 'Copy link'}
                    </button>
                  )}
                  <button className="btn small danger" onClick={() => setConfirm(a)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={`Delete “${confirm.title}”?`}
          message={`This permanently deletes the album and all ${confirm.photoCount} photo(s). This cannot be undone.`}
          confirmLabel="Delete album"
          onConfirm={doDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
