import { useEffect, useRef } from 'react';
import gsap from 'gsap';

// Material Design 3 easing curves
export const MD_EASING = {
  emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  emphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
};

// GSAP-compatible easing
export const GSAP_EASE = {
  emphasized: 'power3.out',
  emphasizedDecelerate: 'power2.out',
  emphasizedAccelerate: 'power2.in',
  standard: 'power2.inOut',
};

export const MD_DURATION = {
  short: 0.15,
  medium: 0.3,
  long: 0.5,
  extraLong: 0.7,
};

export function useRevealAnimation(ready: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!ready || hasAnimated.current || !containerRef.current) return;
    hasAnimated.current = true;

    const tl = gsap.timeline();
    const container = containerRef.current;

    // Stage 1: Reveal the map from darkness
    tl.fromTo(
      container,
      { opacity: 0 },
      { opacity: 1, duration: 1.2, ease: GSAP_EASE.emphasized }
    );

    return () => { tl.kill(); };
  }, [ready]);

  return containerRef;
}
