import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/gallery/manifest.json')
      .then((r) => {
        if (!r.ok) throw new Error('Could not load albums.');
        return r.json();
      })
      .then((d) => setAlbums(d.albums || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="center muted">Loading albums…</div>;
  if (error) return <div className="alert error">{error}</div>;

  if (albums.length === 0) {
    return (
      <div className="empty">
        <h2>No albums yet</h2>
        <p className="muted">
          Add photos under <code>albums/&lt;name&gt;/</code>, run <code>npm run build</code>,
          and push to publish.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head"><h1>Albums</h1></div>
      <div className="album-grid">
        {albums.map((a) => (
          <Link className="album-card" key={a.token} to={`/album/${a.token}`}>
            <div className="album-cover">
              {a.cover ? <img src={a.cover} alt={a.title} loading="lazy" /> : <div className="cover-empty">No photos</div>}
            </div>
            <div className="album-body">
              <span className="album-title">{a.title}</span>
              <div className="muted small">{a.count} photo{a.count === 1 ? '' : 's'}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
