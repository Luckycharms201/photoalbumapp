export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const mb = bytes / 1024 / 1024;
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export const photoLabel = (n) => (n === 1 ? 'Foto' : 'Fotos');
