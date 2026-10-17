/** Demo shortcuts are on in dev builds, or in any build opened with ?demo=1 (for live pitches). */
export function demoHooksEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env?.DEV) return true;
  try {
    return new URLSearchParams(window.location.search).has('demo');
  } catch {
    return false;
  }
}
