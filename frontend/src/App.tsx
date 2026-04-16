import { useState, useCallback } from 'react';
import { useConflicts } from './hooks/useConflicts';
import WorldMap from './components/WorldMap/WorldMap';
import StatsOverlay from './components/StatsOverlay/StatsOverlay';
import ConflictPanel from './components/ConflictPanel/ConflictPanel';
import IntroOverlay from './components/IntroOverlay/IntroOverlay';
import type { Conflict } from './types';

export default function App() {
  const { conflicts, stats, loading } = useConflicts();
  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);
  const [hoveredConflict, setHoveredConflict] = useState<Conflict | null>(null);
  const [introComplete, setIntroComplete] = useState(false);

  const dataReady = !loading && conflicts.length > 0;
  const ready = dataReady && introComplete;

  const handleIntroComplete = useCallback(() => {
    setIntroComplete(true);
  }, []);

  return (
    <>
      {!introComplete && dataReady && stats && (
        <IntroOverlay
          totalDeaths={stats.totalDeaths}
          onComplete={handleIntroComplete}
        />
      )}
      <WorldMap
        conflicts={conflicts}
        selectedConflict={selectedConflict}
        onConflictClick={setSelectedConflict}
        hoveredConflict={hoveredConflict}
        onConflictHover={setHoveredConflict}
        ready={ready}
      />
      <StatsOverlay stats={stats} ready={ready} />
      <ConflictPanel
        conflict={selectedConflict}
        onClose={() => setSelectedConflict(null)}
      />
    </>
  );
}
