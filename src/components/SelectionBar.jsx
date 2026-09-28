import { useEffect, useState } from 'react';
import { saveFiles, saveEach, fetchAsFiles, shareOrWait, galleryTarget } from '../lib/download.js';
import { formatBytes } from '../lib/format.js';

// Photos handed to the iOS share sheet at once. More and a phone may run out
// of memory holding them; a bigger selection goes through in rounds.
const BATCH = 20;

const target = galleryTarget();

// Bottom bar shown while selecting. Owns the download itself so the pages only
// decide *what* is selected. `entries` is null while it is still being loaded.
//
// Phases: idle → zipping | saving (Android) | fetching → ready → next (iOS).
// `ready` holds fetched files waiting for a tap to open the share sheet;
// `next` means a round went into Photos and more photos are left.
export default function SelectionBar({ summary, bytes, zipName, entries, onClear }) {
  const [phase, setPhase] = useState('idle');
  const [done, setDone] = useState(0);
  const [start, setStart] = useState(0);
  const [files, setFiles] = useState(null);
  const [error, setError] = useState('');

  const total = entries?.length ?? 0;
  const empty = total === 0;
  const size = formatBytes(bytes);
  const end = Math.min(start + BATCH, total);
  const range = total > BATCH ? ` ${start + 1}–${end} de ${total}` : '';

  // a changed selection invalidates any round in progress
  useEffect(() => {
    setPhase('idle');
    setStart(0);
    setFiles(null);
  }, [total]);

  const run = async (next, job) => {
    setError('');
    setDone(0);
    setPhase(next);
    try {
      await job();
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'No se pudo completar la descarga.');
      setFiles(null);
      setPhase('idle');
    }
  };

  const reset = () => {
    setFiles(null);
    setStart(0);
    setPhase('idle');
  };

  const share = async (batch, from) => {
    if ((await shareOrWait(batch)) === 'retry') {
      setFiles(batch);
      setPhase('ready');
      return;
    }
    setFiles(null);
    if (from + BATCH < total) {
      setStart(from + BATCH);
      setPhase('next');
    } else {
      reset();
    }
  };

  const onPhotos = (from) => run('fetching', async () => {
    setStart(from);
    await share(await fetchAsFiles(entries.slice(from, from + BATCH), setDone), from);
  });
  const onShareReady = () => run('sharing', () => share(files, start));
  const onGallery = () => run('saving', async () => {
    await saveEach(entries, setDone);
    setPhase('idle');
  });
  const onZip = () => run('zipping', async () => {
    await saveFiles(zipName, entries, setDone);
    setPhase('idle');
  });

  let actions;
  if (phase === 'fetching') {
    actions = <button className="btn primary" disabled>Preparando… {done}/{end - start}</button>;
  } else if (phase === 'zipping' || phase === 'saving') {
    actions = <button className="btn primary" disabled>{phase === 'saving' ? 'Guardando' : 'Preparando'}… {done}/{total}</button>;
  } else if (phase === 'sharing') {
    actions = <button className="btn primary" disabled>Abriendo…</button>;
  } else if (phase === 'ready') {
    actions = (
      <>
        <button className="btn ghost" onClick={reset}>Cancelar</button>
        <button className="btn primary" onClick={onShareReady}>Guardar en Fotos{range}</button>
      </>
    );
  } else if (phase === 'next') {
    actions = (
      <>
        <button className="btn ghost" onClick={reset}>Terminar</button>
        <button className="btn primary" onClick={() => onPhotos(start)}>Continuar{range}</button>
      </>
    );
  } else if (target) {
    actions = (
      <>
        {total > 1 && <button className="btn" onClick={onZip} disabled={empty}>ZIP</button>}
        <button className="btn primary" onClick={target === 'photos' ? () => onPhotos(0) : onGallery} disabled={empty}>
          {target === 'photos' ? 'Guardar en Fotos' : 'Guardar en galería'}
        </button>
      </>
    );
  } else {
    actions = (
      <button className="btn primary" onClick={onZip} disabled={empty}>
        {total > 1 ? '⬇ Descargar ZIP' : '⬇ Descargar'}
      </button>
    );
  }

  let hint = null;
  if (target === 'photos' && !empty) {
    hint = phase === 'next'
      ? `Listas ${start} de ${total}. Continúa con las siguientes.`
      : `En el menú, elige “Guardar imágenes”${total > BATCH ? `. Van de ${BATCH} en ${BATCH}` : ''}.`;
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
          {hint && <span className="muted small">{hint}</span>}
          {error && <span className="selection-bar-error">{error}</span>}
        </div>
        <div className="selection-bar-actions">
          {actions}
        </div>
      </div>
    </div>
  );
}
