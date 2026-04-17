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

    const tl = gsap.timeline({ delay: 1.2 });

    tl.fromTo(
      containerRef.current,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 1.4, ease: GSAP_EASE.emphasizedDecelerate }
    );

    const valueEls = [deathCountRef.current, conflictCountRef.current].filter(Boolean);
    tl.fromTo(
      valueEls,
      { y: '110%' },
      {
        y: '0%',
        duration: 1.4,
        stagger: 0.22,
        ease: GSAP_EASE.emphasizedDecelerate,
      },
      '-=1.2'
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
        <svg className={styles.icon} viewBox="0 0 100 100" fill="currentColor">
          {/* 16 positions on r=36 ring, 4 missing + 3 fading = lives lost */}
          <circle cx="50"   cy="14"   r="4.5" opacity="0.9"/>
          <circle cx="63.8" cy="16.7" r="4.5" opacity="0.9"/>
          {/* pos 2: missing */}
          <circle cx="83.3" cy="36.2" r="4.5" opacity="0.9"/>
          <circle cx="86"   cy="50"   r="4.5" opacity="0.9"/>
          <circle cx="83.3" cy="63.8" r="3"   opacity="0.3"/>
          <circle cx="75.5" cy="75.5" r="4.5" opacity="0.9"/>
          {/* pos 7: missing */}
          {/* pos 8: missing */}
          <circle cx="36.2" cy="83.3" r="3"   opacity="0.3"/>
          <circle cx="24.5" cy="75.5" r="4.5" opacity="0.9"/>
          {/* pos 11: missing */}
          <circle cx="14"   cy="50"   r="4.5" opacity="0.9"/>
          <circle cx="16.7" cy="36.2" r="4.5" opacity="0.9"/>
          <circle cx="24.5" cy="24.5" r="3"   opacity="0.3"/>
          <circle cx="36.2" cy="16.7" r="4.5" opacity="0.9"/>
          <circle cx="50"   cy="50"   r="4"   opacity="0.45"/>
        </svg>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>DEATHS IN WAR</h1>
          <span className={styles.updated}>Last updated: {lastUpdated}</span>
        </div>
        <a
          href="https://github.com/MilesMa-Dev/deaths-in-war"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.githubLink}
          aria-label="View source on GitHub"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" width="18" height="18">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
      </div>

      <div className={styles.statsCards}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Deaths</span>
          <span className={styles.valueMask}>
            <span ref={deathCountRef} className={styles.statValue}>
              {stats.totalDeaths.toLocaleString('en-US')}
            </span>
          </span>
        </div>
        <div className={styles.divider} />
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Active Conflicts</span>
          <span className={styles.valueMask}>
            <span ref={conflictCountRef} className={styles.statValueSmall}>
              {stats.totalConflicts}
            </span>
          </span>
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
