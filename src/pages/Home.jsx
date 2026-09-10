import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import FolderCard from '../components/FolderCard.jsx';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const mb = bytes / 1024 / 1024;
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

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
          <Link key={a.token} to={`/album/${a.token}`} aria-label={a.title}>
            <FolderCard
              title={a.title}
              subtitle={a.subtitle}
              count={a.count}
              countLabel={a.count === 1 ? 'Foto' : 'Fotos'}
              meta={formatBytes(a.zipBytes)}
              cover={a.cover}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
