import { Link } from 'react-router-dom';
import FolderCard from './FolderCard.jsx';
import { formatBytes, photoLabel } from '../lib/format.js';

// Folder cards for albums and collections; both open at /album/<token>.
export default function AlbumGrid({ albums }) {
  return (
    <div className="album-grid">
      {albums.map((a) => (
        <Link key={a.token} to={`/album/${a.token}`} aria-label={a.title}>
          <FolderCard
            title={a.title}
            subtitle={a.subtitle ?? (a.kind === 'collection' ? `${a.albumCount} carpetas` : undefined)}
            count={a.count}
            countLabel={photoLabel(a.count)}
            meta={formatBytes(a.bytes)}
            cover={a.cover}
          />
        </Link>
      ))}
    </div>
  );
}
