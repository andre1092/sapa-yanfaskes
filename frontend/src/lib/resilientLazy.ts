import React, { lazy } from 'react';
import type { ComponentType } from 'react';

interface LazyOptions {
  retries?: number;
  intervalMs?: number;
}

export function resilientLazy<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  options: LazyOptions = {}
): React.LazyExoticComponent<T> {
  const { retries = 2, intervalMs = 1000 } = options;

  return lazy(() =>
    new Promise<{ default: T }>((resolve, reject) => {
      function attempt(remainingRetries: number) {
        factory()
          .then(resolve)
          .catch((error: Error) => {
            if (remainingRetries <= 0) {
              const isChunkError =
                error.name === 'ChunkLoadError' ||
                /Loading chunk [\d]+ failed/i.test(error.message) ||
                /Failed to fetch dynamically imported module/i.test(error.message);

              if (isChunkError && typeof window !== 'undefined') {
                const storageKey = 'chunk_reload_attempted';
                if (!sessionStorage.getItem(storageKey)) {
                  sessionStorage.setItem(storageKey, 'true');
                  window.location.reload();
                  return;
                }
              }
              reject(error);
              return;
            }

            // Exponential backoff retry
            setTimeout(() => {
              attempt(remainingRetries - 1);
            }, intervalMs * Math.pow(1.5, retries - remainingRetries));
          });
      }

      attempt(retries);
    })
  );
}
