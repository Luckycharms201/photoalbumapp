import { useCallback, useState } from 'react';

// A set of selected keys plus the on/off switch for selection mode.
export default function useSelection() {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  const toggle = useCallback((key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setAll = useCallback((keys) => setSelected(new Set(keys)), []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const start = useCallback(() => setSelecting(true), []);
  const stop = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  return { selecting, selected, toggle, setAll, clear, start, stop };
}
