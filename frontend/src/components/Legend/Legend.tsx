import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { GSAP_EASE, MD_DURATION } from '../../hooks/useRevealAnimation';
import styles from './Legend.module.scss';

interface LegendProps {
  ready: boolean;
}

const ITEMS = [
  { label: 'Major War', color: '#b71c1c', description: '10,000+ deaths/year' },
  { label: 'War', color: '#c62828', description: '1,000–9,999' },
  { label: 'Minor Conflict', color: '#d32f2f', description: '100–999' },
  { label: 'Skirmish', color: '#e57373', description: '<100' },
];

export default function Legend({ ready }: LegendProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready || !containerRef.current) return;

    gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: 10 },
      {
        opacity: 1,
        y: 0,
        duration: MD_DURATION.long,
        ease: GSAP_EASE.emphasizedDecelerate,
        delay: 1.5,
      }
    );
  }, [ready]);

  return (
    <div ref={containerRef} className={styles.legend} style={{ opacity: 0 }}>
      {ITEMS.map((item) => (
        <div key={item.label} className={styles.item}>
          <span className={styles.dot} style={{ backgroundColor: item.color }} />
          <span className={styles.label}>{item.label}</span>
          <span className={styles.description}>{item.description}</span>
        </div>
      ))}
    </div>
  );
}
