import { lazy, Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useMatch } from 'react-router-dom';
import { useConflicts } from './hooks/useConflicts';
import StatsOverlay from './components/StatsOverlay/StatsOverlay';
import ConflictPanel from './components/ConflictPanel/ConflictPanel';
import IntroOverlay from './components/IntroOverlay/IntroOverlay';
import type { Conflict } from './types';

const WorldMap = lazy(() => import('./components/WorldMap/WorldMap'));

export default function App() {
  const { conflicts, stats, loading } = useConflicts();
  const conflictMatch = useMatch('/conflict/:slug');
  const slug = conflictMatch?.params.slug;

  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);
  const [hoveredConflict, setHoveredConflict] = useState<Conflict | null>(null);
  const [introComplete, setIntroComplete] = useState(!!slug);
  const initialSlugHandled = useRef(false);

  const dataReady = !loading && conflicts.length > 0;
  const ready = dataReady && introComplete;

  useEffect(() => {
    if (!slug || !dataReady || initialSlugHandled.current) return;
    const match = conflicts.find(c => c.id === slug);
    if (match) {
      setSelectedConflict(match);
      initialSlugHandled.current = true;
    }
  }, [slug, dataReady, conflicts]);

  const handleConflictClick = useCallback((conflict: Conflict) => {
    setSelectedConflict(conflict);
    window.history.replaceState(null, '', `/conflict/${conflict.id}`);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedConflict(null);
    window.history.replaceState(null, '', '/');
  }, []);

  const handleIntroComplete = useCallback(() => {
    setIntroComplete(true);
  }, []);

  return (
    <main role="main">
      {!introComplete && dataReady && stats && (
        <IntroOverlay
          totalDeaths={stats.totalDeaths}
          onComplete={handleIntroComplete}
        />
      )}
      <Suspense fallback={null}>
        <WorldMap
          conflicts={conflicts}
          selectedConflict={selectedConflict}
          onConflictClick={handleConflictClick}
          hoveredConflict={hoveredConflict}
          onConflictHover={setHoveredConflict}
          ready={ready}
        />
      </Suspense>
      <StatsOverlay stats={stats} ready={ready} />
      <ConflictPanel
        conflict={selectedConflict}
        onClose={handleClose}
      />
    </main>
  );
}
