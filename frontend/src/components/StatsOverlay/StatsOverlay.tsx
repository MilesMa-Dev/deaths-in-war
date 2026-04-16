import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import type { StatsResponse } from '../../types';
import { GSAP_EASE, MD_DURATION } from '../../hooks/useRevealAnimation';
import styles from './StatsOverlay.module.scss';

interface StatsOverlayProps {
  stats: StatsResponse | null;
  ready: boolean;
}

export default function StatsOverlay({ stats, ready }: StatsOverlayProps) {
  const deathCountRef = useRef<HTMLSpanElement>(null);
  const conflictCountRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!ready || !stats || hasAnimated.current) return;
    hasAnimated.current = true;

    const tl = gsap.timeline({ delay: 0.8 });

    // Fade in the container
    tl.fromTo(
      containerRef.current,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: MD_DURATION.long, ease: GSAP_EASE.emphasizedDecelerate }
    );

    // Count up death toll
    const counter = { val: 0 };
    tl.to(
      counter,
      {
        val: stats.totalDeaths,
        duration: 2.5,
        ease: GSAP_EASE.emphasizedDecelerate,
        snap: { val: 1 },
        onUpdate: () => {
          if (deathCountRef.current) {
            deathCountRef.current.textContent = Math.floor(counter.val).toLocaleString('en-US');
          }
        },
      },
      '-=0.3'
    );

    // Count up conflicts
    const conflictCounter = { val: 0 };
    tl.to(
      conflictCounter,
      {
        val: stats.totalConflicts,
        duration: 1.5,
        ease: GSAP_EASE.emphasizedDecelerate,
        snap: { val: 1 },
        onUpdate: () => {
          if (conflictCountRef.current) {
            conflictCountRef.current.textContent = Math.floor(conflictCounter.val).toString();
          }
        },
      },
      '-=2.0'
    );

    return () => { tl.kill(); };
  }, [ready, stats]);

  if (!stats) return null;

  const lastUpdated = new Date(stats.lastUpdated).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div ref={containerRef} className={styles.overlay} style={{ opacity: 0 }}>
      <div className={styles.header}>
        <svg className={styles.icon} viewBox="0 0 24 32" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="12" y1="2" x2="12" y2="30" />
          <line x1="4" y1="11" x2="20" y2="11" />
        </svg>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>DEATHS IN WAR</h1>
          <span className={styles.updated}>Last updated: {lastUpdated}</span>
        </div>
      </div>

      <div className={styles.statsCards}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Deaths</span>
          <span ref={deathCountRef} className={styles.statValue}>0</span>
        </div>
        <div className={styles.divider} />
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Active Conflicts</span>
          <span ref={conflictCountRef} className={styles.statValueSmall}>0</span>
        </div>
        <div className={styles.divider} />
        <a
          href="https://en.wikipedia.org/wiki/List_of_ongoing_armed_conflicts"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.sourceLink}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Data from Wikipedia
        </a>
      </div>
    </div>
  );
}
