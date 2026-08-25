import { useEffect, useRef } from 'react';

export function useChartPrefetch(thresholdPixels = 300) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Initiate dynamic import in background to prime browser HTTP cache
            import('../components/ModularPlot');
            observer.disconnect();
          }
        });
      },
      { rootMargin: `${thresholdPixels}px 0px` }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [thresholdPixels]);

  return containerRef;
}
