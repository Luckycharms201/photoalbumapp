import { useEffect, useState } from 'react';
import AlbumGrid from '../components/AlbumGrid.jsx';

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
      <div className="page-head"><h1>Álbumes</h1></div>
      <AlbumGrid albums={albums} />
    </div>
  );
}
