// Library IDs and bibcodes arrive from tool input and land in URL paths, where
// `new URL()` resolves dot segments — so an unvalidated identifier can retarget
// a request at a different endpoint than the tool the caller approved.

// ADS library IDs are URL-safe base64, e.g. bMF6Lm0LT4-Qs0rUPzxKmA.
const LIBRARY_ID = /^[A-Za-z0-9_-]{1,64}$/;

const MAX_BIBCODE_LENGTH = 200;

// Rejected rather than escaped: a bibcode holding a path delimiter is not a
// bibcode, and quietly rewriting it would issue a request nobody asked for.
const PATH_DELIMITER = /[/\\?#]|[\u0000-\u001f\u007f]/;

// `%2e` counts as a dot when the URL parser matches dot segments, so normalize
// before comparing.
function isDotSegment(value: string): boolean {
  const decoded = value.replace(/%2e/gi, '.');
  return decoded === '.' || decoded === '..';
}

export function libraryIdSegment(value: string): string {
  if (!LIBRARY_ID.test(value)) {
    throw new Error(
      'Invalid library_id: expected 1-64 characters from [A-Za-z0-9_-]'
    );
  }
  return value;
}

export function bibcodeSegment(value: string): string {
  if (value.length === 0 || value.length > MAX_BIBCODE_LENGTH) {
    throw new Error(`Invalid bibcode: expected 1-${MAX_BIBCODE_LENGTH} characters`);
  }
  if (PATH_DELIMITER.test(value)) {
    throw new Error('Invalid bibcode: path delimiters and control characters are not allowed');
  }
  // encodeURIComponent leaves dots untouched, so a literal `..` would survive.
  if (isDotSegment(value)) {
    throw new Error('Invalid bibcode: dot segments are not allowed');
  }
  // Escapes `%` to `%25`, which also defuses percent-encoded dot segments.
  return encodeURIComponent(value);
}
