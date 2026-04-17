import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import type { Conflict } from '../../types';
import { GSAP_EASE, MD_DURATION } from '../../hooks/useRevealAnimation';
import styles from './ConflictPanel.module.scss';

interface ConflictPanelProps {
  conflict: Conflict | null;
  onClose: () => void;
}

const BP_MOBILE = 600;

const INTENSITY_LABELS: Record<string, string> = {
  major_war: 'Major War',
  war: 'War',
  minor_conflict: 'Minor Conflict',
  skirmish: 'Skirmish',
};

function isMobile() {
  return window.innerWidth <= BP_MOBILE;
}

const SWIPE_CLOSE_THRESHOLD = 80;

export default function ConflictPanel({ conflict, onClose }: ConflictPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const closeTlRef = useRef<gsap.core.Timeline | null>(null);
  const closingRef = useRef(false);
  const dragRef = useRef({ startY: 0, currentY: 0, dragging: false });

  const [displayConflict, setDisplayConflict] = useState<Conflict | null>(null);

  useEffect(() => {
    if (conflict) {
      if (closeTlRef.current) {
        closeTlRef.current.kill();
        closeTlRef.current = null;
      }
      closingRef.current = false;
      setDisplayConflict(conflict);
    }
  }, [conflict]);

  useEffect(() => {
    if (!displayConflict || closingRef.current) return;

    const mobile = isMobile();
    const slideFrom = mobile ? { y: '100%', opacity: 0 } : { x: '100%', opacity: 0 };
    const slideTo = mobile ? { y: '0%', opacity: 1 } : { x: '0%', opacity: 1 };

    const tl = gsap.timeline();

    tl.fromTo(
      scrimRef.current,
      { opacity: 0 },
      { opacity: 1, duration: MD_DURATION.medium, ease: GSAP_EASE.emphasized }
    );

    tl.fromTo(
      panelRef.current,
      slideFrom,
      { ...slideTo, duration: MD_DURATION.long, ease: GSAP_EASE.emphasized },
      '-=0.2'
    );

    const validRefs = contentRefs.current.filter(Boolean);
    tl.fromTo(
      validRefs,
      { opacity: 0, y: 16 },
      {
        opacity: 1,
        y: 0,
        duration: MD_DURATION.medium,
        ease: GSAP_EASE.emphasizedDecelerate,
        stagger: 0.05,
      },
      '-=0.2'
    );

    return () => { tl.kill(); };
  }, [displayConflict]);

  // Swipe-down-to-close on mobile
  useEffect(() => {
    const panel = panelRef.current;
    if (!displayConflict || !panel || closingRef.current) return;
    if (!isMobile()) return;

    const onTouchStart = (e: TouchEvent) => {
      if (panel.scrollTop > 0) return;
      dragRef.current = { startY: e.touches[0].clientY, currentY: e.touches[0].clientY, dragging: false };
    };

    const onTouchMove = (e: TouchEvent) => {
      const d = dragRef.current;
      const dy = e.touches[0].clientY - d.startY;
      if (!d.dragging && dy > 8) {
        d.dragging = true;
      }
      if (!d.dragging) return;

      d.currentY = e.touches[0].clientY;
      const offset = Math.max(0, d.currentY - d.startY);
      panel.style.transform = `translateY(${offset}px)`;
      panel.style.transition = 'none';
    };

    const onTouchEnd = () => {
      const d = dragRef.current;
      if (!d.dragging) return;
      d.dragging = false;
      const offset = Math.max(0, d.currentY - d.startY);

      if (offset > SWIPE_CLOSE_THRESHOLD) {
        panel.style.transition = '';
        panel.style.transform = '';
        gsap.set(panel, { y: offset });
        handleClose();
      } else {
        panel.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)';
        panel.style.transform = 'translateY(0)';
      }
    };

    panel.addEventListener('touchstart', onTouchStart, { passive: true });
    panel.addEventListener('touchmove', onTouchMove, { passive: true });
    panel.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      panel.removeEventListener('touchstart', onTouchStart);
      panel.removeEventListener('touchmove', onTouchMove);
      panel.removeEventListener('touchend', onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayConflict]);

  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;

    onClose();

    const mobile = isMobile();
    const slideOut = mobile ? { y: '100%' } : { x: '100%' };

    const tl = gsap.timeline({
      onComplete: () => {
        setDisplayConflict(null);
        closingRef.current = false;
        closeTlRef.current = null;
      },
    });
    closeTlRef.current = tl;

    tl.to(panelRef.current, {
      ...slideOut,
      opacity: 0,
      duration: MD_DURATION.medium,
      ease: GSAP_EASE.emphasizedAccelerate,
    });

    tl.to(
      scrimRef.current,
      { opacity: 0, duration: MD_DURATION.medium, ease: GSAP_EASE.emphasizedAccelerate },
      '-=0.2'
    );
  };

  if (!displayConflict) return null;

  const setRef = (index: number) => (el: HTMLDivElement | null) => {
    contentRefs.current[index] = el;
  };

  return (
    <>
      <div
        ref={scrimRef}
        className={styles.scrim}
        onClick={handleClose}
        style={{ opacity: 0 }}
      />
      <aside ref={panelRef} className={styles.panel} style={{ opacity: 0 }} role="complementary" aria-label="Conflict details">
        <div className={styles.dragHandle} aria-hidden="true"><span /></div>
        <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 ref={setRef(0)} className={styles.conflictName}>
          {displayConflict.name}
        </h2>

        <div ref={setRef(1)} className={styles.intensityBadge} data-intensity={displayConflict.intensity}>
          {INTENSITY_LABELS[displayConflict.intensity] || displayConflict.intensity}
        </div>

        <div ref={setRef(2)} className={styles.section}>
          <span className={styles.sectionLabel}>Total Deaths</span>
          <span className={styles.deathCount}>{displayConflict.deathToll.totalDisplay}</span>
        </div>

        {displayConflict.deathToll.recent !== undefined && displayConflict.deathToll.recent > 0 && (
          <div ref={setRef(3)} className={styles.section}>
            <span className={styles.sectionLabel}>Recent Annual Deaths</span>
            <span className={styles.recentCount}>
              {displayConflict.deathToll.recent.toLocaleString('en-US')}
            </span>
          </div>
        )}

        <div ref={setRef(4)} className={styles.section}>
          <span className={styles.sectionLabel}>Since</span>
          <span className={styles.detailText}>{displayConflict.startYear}</span>
        </div>

        <div ref={setRef(5)} className={styles.section}>
          <span className={styles.sectionLabel}>Location</span>
          <span className={styles.detailText}>{displayConflict.countries.join(', ')}</span>
        </div>

        <div ref={setRef(6)} className={styles.sourceLink}>
          <a href={displayConflict.sourceUrl} target="_blank" rel="noopener noreferrer">
            View on Wikipedia
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </aside>
    </>
  );
}
