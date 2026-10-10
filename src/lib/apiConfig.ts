/**
 * Unified API Routing & Cross-Environment Synchronization Configuration
 * 
 * Ensures that both the standard web application (https://piflix.ai.studio)
 * and the Pi Network / Pi Browser environment (https://apppiflixfat9963.pinet.com)
 * always resolve the exact same authoritative backend APIs and published release.
 */

export const AUTHORITATIVE_BACKEND_URL = 'https://piflix.ai.studio';

/**
 * Determines the authoritative backend origin for the current client runtime.
 * When accessed through PiNet (*.pinet.com) or Pi Network WebViews, API calls to relative
 * paths (/api/...) would fail with 404 because PiNet proxies only the frontend.
 * This resolver routes all API requests directly to the authoritative backend.
 */
export function getBackendOrigin(): string {
  if (typeof window === 'undefined') return '';
  const host = window.location?.hostname || '';
  if (host.includes('pinet.com') || host.includes('minepi.com')) {
    return AUTHORITATIVE_BACKEND_URL;
  }
  return '';
}

/**
 * Resolves an API endpoint path to a fully qualified URL when running on PiNet,
 * or keeps it relative when running on the origin backend or localhost.
 */
export function resolveApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const origin = getBackendOrigin();
  return origin ? `${origin}${cleanPath}` : cleanPath;
}

/**
 * Direct wrapper for fetch that guarantees apiUrl resolution on PiNet.
 */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const targetUrl = resolveApiUrl(input);
  return fetch(targetUrl, init);
}

/**
 * Safely installs an API fetch interceptor at application bootstrap.
 * Wrapped in defensive try/catch to ensure environments with read-only window.fetch
 * (such as strict iframe sandboxes) never crash.
 */
export function installApiFetchInterceptor(): void {
  if (typeof window === 'undefined') return;
  if ((window as any).__piflix_fetch_interceptor_installed) return;

  try {
    const originalFetch = window.fetch ? window.fetch.bind(window) : undefined;
    if (!originalFetch) return;

    const customFetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      if (typeof input === 'string' && input.startsWith('/api/')) {
        const targetUrl = resolveApiUrl(input);
        return originalFetch(targetUrl, init);
      }
      return originalFetch(input, init);
    };

    let installed = false;
    try {
      const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
      if (!desc || desc.writable || typeof desc.set === 'function') {
        window.fetch = customFetch;
        installed = true;
      }
    } catch {
      // Suppress assignment error on read-only getter
    }

    if (!installed) {
      try {
        Object.defineProperty(window, 'fetch', {
          value: customFetch,
          writable: true,
          configurable: true
        });
        installed = true;
      } catch {
        // window.fetch is non-writable in this environment sandbox; resolveApiUrl handles routing directly
      }
    }

    if (installed) {
      (window as any).__piflix_fetch_interceptor_installed = true;
    }
  } catch (err) {
    console.info('[PiFlix API] Safe interceptor skip:', err);
  }
}

