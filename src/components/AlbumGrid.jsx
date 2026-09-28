import { Link } from 'react-router-dom';
import FolderCard from './FolderCard.jsx';
import { formatBytes, photoLabel } from '../lib/format.js';

// Folder cards for albums and collections; both open at /album/<token>.
// While `selecting`, a tap toggles the card instead of opening it.
export default function AlbumGrid({ albums, selecting = false, selected, onToggle }) {
  return (
    <div className={`album-grid${selecting ? ' is-selecting' : ''}`}>
      {albums.map((a) => {
        const card = (
          <FolderCard
            title={a.title}
            subtitle={a.subtitle ?? (a.kind === 'collection' ? `${a.albumCount} carpetas` : undefined)}
            count={a.count}
            countLabel={photoLabel(a.count)}
            meta={formatBytes(a.bytes)}
            cover={a.cover}
          />
        );
        if (!selecting) {
          return (
            <Link key={a.token} to={`/album/${a.token}`} aria-label={a.title}>{card}</Link>
          );
        }
        const on = selected.has(a.token);
        return (
          <button
            key={a.token}
            type="button"
            className={`album-select${on ? ' is-selected' : ''}`}
            aria-pressed={on}
            aria-label={a.title}
            onClick={() => onToggle(a.token)}
          >
            {card}
            <span className="select-check" aria-hidden="true">{on ? '✓' : ''}</span>
          </button>
        );
      })}
    </div>
  );
}
