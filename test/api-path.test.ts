import { describe, it, expect } from 'vitest';
import { libraryIdSegment, bibcodeSegment } from '../src/api-path.js';

describe('libraryIdSegment', () => {
  it('accepts URL-safe base64 identifiers as ADS issues them', () => {
    expect(libraryIdSegment('bMF6Lm0LT4-Qs0rUPzxKmA')).toBe('bMF6Lm0LT4-Qs0rUPzxKmA');
    expect(libraryIdSegment('lib1')).toBe('lib1');
    expect(libraryIdSegment('smoke_Lib-Id')).toBe('smoke_Lib-Id');
  });

  it.each([
    ['dot segments', '../../../documents/example-library'],
    ['a bare parent segment', '..'],
    ['a forward slash', 'lib1/notes'],
    ['a backslash', 'lib1\\notes'],
    ['a query delimiter', 'lib1?x=1'],
    ['a fragment delimiter', 'lib1#frag'],
    ['percent encoding', 'lib%2e%2e'],
    ['an empty string', ''],
    ['over-length input', 'a'.repeat(65)]
  ])('rejects %s', (_label, value) => {
    expect(() => libraryIdSegment(value)).toThrow(/Invalid library_id/);
  });
});

describe('bibcodeSegment', () => {
  it('passes canonical bibcodes through byte-for-byte', () => {
    expect(bibcodeSegment('2024ApJ...123..456A')).toBe('2024ApJ...123..456A');
    expect(bibcodeSegment('2024arXiv240101234S')).toBe('2024arXiv240101234S');
  });

  // Ampersand journals (A&A, A&AS) are common and must survive, percent-encoded
  // so the path stays unambiguous.
  it('percent-encodes ampersands rather than rejecting them', () => {
    expect(bibcodeSegment('1998A&AS..130..333B')).toBe('1998A%26AS..130..333B');
  });

  it.each([
    ['dot-segment traversal', '../../../documents/example-library'],
    ['a bare parent segment', '..'],
    ['a bare current segment', '.'],
    ['percent-encoded dot segments', '%2e%2e'],
    ['a forward slash', 'a/b'],
    ['a backslash', 'a\\b'],
    ['a query delimiter', 'a?b'],
    ['a fragment delimiter', 'a#b'],
    ['a NUL byte', 'a\u0000b'],
    ['a newline', 'a\nb'],
    ['a DEL byte', 'a\u007fb'],
    ['an empty string', ''],
    ['over-length input', 'a'.repeat(201)]
  ])('rejects %s', (_label, value) => {
    expect(() => bibcodeSegment(value)).toThrow(/Invalid bibcode/);
  });

  // encodeURIComponent leaves `.` alone, so escaping alone would not have
  // stopped a literal `..`; the explicit dot-segment check is load-bearing.
  it('neutralises percent-encoded dots that survive encoding', () => {
    expect(bibcodeSegment('2024%2eApJ')).toBe('2024%252eApJ');
  });
});
