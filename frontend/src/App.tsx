import { lazy, Suspense, useState, useCallback, useEffect } from 'react';
import { Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { useConflicts } from './hooks/useConflicts';
import StatsOverlay from './components/StatsOverlay/StatsOverlay';
import ConflictPanel from './components/ConflictPanel/ConflictPanel';
import IntroOverlay from './components/IntroOverlay/IntroOverlay';
import type { Conflict } from './types';

const WorldMap = lazy(() => import('./components/WorldMap/WorldMap'));

function GlobeView({ autoSelectSlug }: { autoSelectSlug?: string }) {
  const { conflicts, stats, loading } = useConflicts();
  const navigate = useNavigate();
  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);
  const [hoveredConflict, setHoveredConflict] = useState<Conflict | null>(null);
  const [introComplete, setIntroComplete] = useState(!!autoSelectSlug);

  const dataReady = !loading && conflicts.length > 0;
  const ready = dataReady && introComplete;

  useEffect(() => {
    if (!autoSelectSlug || !dataReady) return;
    const match = conflicts.find(c => c.id === autoSelectSlug);
    if (match) setSelectedConflict(match);
  }, [autoSelectSlug, dataReady, conflicts]);

  const handleConflictClick = useCallback((conflict: Conflict) => {
    setSelectedConflict(conflict);
    navigate(`/conflict/${conflict.id}`, { replace: true });
  }, [navigate]);

  const handleClose = useCallback(() => {
    setSelectedConflict(null);
    navigate('/', { replace: true });
  }, [navigate]);

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

function ConflictRoute() {
  const { slug } = useParams<{ slug: string }>();
  return <GlobeView autoSelectSlug={slug} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GlobeView />} />
      <Route path="/conflict/:slug" element={<ConflictRoute />} />
    </Routes>
  );
}
