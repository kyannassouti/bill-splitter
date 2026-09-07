/** Session codes are six characters from an ambiguity-safe alphabet. */
const CODE_PATTERN = /^[A-Z0-9]{6}$/;

/**
 * Pull a session code out of whatever a QR scan produced — a bare code, or a
 * join link like https://example.com/?code=X7K9M2. Returns null if there
 * isn't one, so callers can keep scanning instead of acting on noise.
 */
export function extractSessionCode(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  if (CODE_PATTERN.test(trimmed)) return trimmed;

  try {
    const url = new URL(raw.trim());
    const fromQuery = url.searchParams.get('code');
    if (fromQuery && CODE_PATTERN.test(fromQuery.toUpperCase())) {
      return fromQuery.toUpperCase();
    }
    const fromPath = url.pathname.toUpperCase().match(/\/([A-Z0-9]{6})(?:\/|$)/);
    if (fromPath) return fromPath[1];
  } catch {
    // Not a URL — nothing more to try.
  }
  return null;
}

/** The link encoded into a session's QR code. */
export function joinUrl(code: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/?code=${code}`;
}
