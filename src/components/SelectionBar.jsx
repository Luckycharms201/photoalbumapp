import { useState } from 'react';
import { saveFiles, fetchAsFiles, canShareFiles } from '../lib/download.js';
import { formatBytes } from '../lib/format.js';

// More than this and a phone may run out of memory holding the files for the
// share sheet; past it the ZIP is the only route offered.
const SHARE_MAX = 60;

// Bottom bar shown while selecting. Owns the download itself so the pages only
// decide *what* is selected. `entries` is null while it is still being loaded.
export default function SelectionBar({ summary, bytes, zipName, entries, allowShare, onClear }) {
  const [phase, setPhase] = useState('idle'); // idle | zipping | fetching | ready
  const [done, setDone] = useState(0);
  const [files, setFiles] = useState(null);
  const [error, setError] = useState('');

  const total = entries?.length ?? 0;
  const empty = total === 0;
  const share = allowShare && total > 1 && total <= SHARE_MAX && canShareFiles();
  const size = formatBytes(bytes);

  const run = async (next, job) => {
    setError('');
    setDone(0);
    setPhase(next);
    try {
      await job();
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'No se pudo completar la descarga.');
      setPhase('idle');
    }
  };

  const onZip = () => run('zipping', async () => {
    await saveFiles(zipName, entries, setDone);
    setPhase('idle');
  });

  const onPrepareShare = () => run('fetching', async () => {
    setFiles(await fetchAsFiles(entries, setDone));
    setPhase('ready');
  });

  const onShare = () => run('ready', async () => {
    await navigator.share({ files });
    setFiles(null);
    setPhase('idle');
  });

  let actions;
  if (phase === 'zipping' || phase === 'fetching') {
    actions = <button className="btn primary" disabled>Preparando… {done}/{total}</button>;
  } else if (phase === 'ready') {
    actions = (
      <>
        <button className="btn ghost" onClick={() => { setFiles(null); setPhase('idle'); }}>Cancelar</button>
        <button className="btn primary" onClick={onShare}>Guardar {total} fotos</button>
      </>
    );
  } else {
    actions = (
      <>
        {share && <button className="btn" onClick={onPrepareShare} disabled={empty}>Guardar en Fotos</button>}
        <button className="btn primary" onClick={onZip} disabled={empty}>
          {total > 1 ? '⬇ Descargar ZIP' : '⬇ Descargar'}
        </button>
      </>
    );
  }

  return (
    <div className="selection-bar" role="region" aria-label="Selección">
      <div className="selection-bar-inner">
        <div className="selection-bar-info">
          <strong>{summary}</strong>
          <span className="muted small">
            {size}
            {phase === 'idle' && !empty && (
              <button className="link-btn" onClick={onClear}>Limpiar</button>
            )}
          </span>
          {error && <span className="selection-bar-error">{error}</span>}
        </div>
        <div className="selection-bar-actions">
          {actions}
        </div>
      </div>
    </div>
  );
}
