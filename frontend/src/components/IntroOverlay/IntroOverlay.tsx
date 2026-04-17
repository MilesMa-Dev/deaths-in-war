import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { GSAP_EASE } from '../../hooks/useRevealAnimation';
import styles from './IntroOverlay.module.scss';

interface IntroOverlayProps {
  totalDeaths: number;
  onComplete: () => void;
}

export default function IntroOverlay({ totalDeaths, onComplete }: IntroOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const wordEls = useRef<(HTMLSpanElement | null)[]>([]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const formattedDeaths = totalDeaths.toLocaleString('en-US');
  const lines = [
    [{ text: formattedDeaths, accent: true }],
    [
      { text: 'lives', accent: false },
      { text: 'have', accent: false },
      { text: 'been', accent: false },
      { text: 'lost', accent: false },
    ],
    [
      { text: 'in', accent: false },
      { text: 'ongoing', accent: false },
      { text: 'wars.', accent: false },
    ],
  ];
  let wordIndex = 0;

  useEffect(() => {
    const els = wordEls.current.filter(Boolean) as HTMLSpanElement[];
    if (els.length === 0) return;

    let tl: gsap.core.Timeline;

    document.fonts.ready.then(() => {
      tl = gsap.timeline();

      tl.fromTo(
        els,
        { y: '110%', opacity: 0 },
        {
          y: '0%',
          opacity: 1,
          duration: 1.2,
          stagger: 0.18,
          ease: GSAP_EASE.emphasizedDecelerate,
        }
      );

      tl.to({}, { duration: 2.5 });

      tl.to(overlayRef.current, {
        opacity: 0,
        duration: 1,
        ease: GSAP_EASE.emphasized,
        onComplete: () => onCompleteRef.current(),
      });
    });

    return () => { tl?.kill(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={overlayRef} className={styles.overlay}>
      <div className={styles.sentence}>
        {lines.map((line, li) => {
          const lineEl = (
            <p key={li} className={styles.line}>
              {line.map((token) => {
                const i = wordIndex++;
                return (
                  <span key={i} className={styles.wordMask}>
                    <span
                      ref={(el) => { wordEls.current[i] = el; }}
                      className={`${styles.word} ${token.accent ? styles.accent : ''}`}
                    >
                      {token.text}
                    </span>
                  </span>
                );
              })}
            </p>
          );
          return lineEl;
        })}
      </div>
    </div>
  );
}
