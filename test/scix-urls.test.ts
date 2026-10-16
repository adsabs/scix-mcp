import { describe, it, expect } from 'vitest';
import {
  abstractUrl,
  citationsUrl,
  referencesUrl,
  searchUrl,
  libraryUrl
} from '../src/scix-urls.js';

describe('scix-urls', () => {
  it('builds abstract, citations, and references URLs on scixplorer.org', () => {
    const bibcode = '2024ApJ...123..456A';
    expect(abstractUrl(bibcode)).toBe(
      'https://scixplorer.org/abs/2024ApJ...123..456A/abstract'
    );
    expect(citationsUrl(bibcode)).toBe(
      'https://scixplorer.org/abs/2024ApJ...123..456A/citations'
    );
    expect(referencesUrl(bibcode)).toBe(
      'https://scixplorer.org/abs/2024ApJ...123..456A/references'
    );
  });

  it('never points at an ADS host', () => {
    const urls = [
      abstractUrl('2024ApJ...123..456A'),
      searchUrl('star'),
      libraryUrl('bMF6Lm0LT4-Qs0rUPzxKmA', true),
      libraryUrl('bMF6Lm0LT4-Qs0rUPzxKmA', false)
    ];
    for (const url of urls) {
      expect(url).toContain('scixplorer.org');
      expect(url).not.toContain('adsabs');
      expect(url).not.toContain('harvard.edu');
    }
  });

  it('percent-encodes bibcodes that carry URL-significant characters', () => {
    expect(abstractUrl('2024A&A...1..1X')).toBe(
      'https://scixplorer.org/abs/2024A%26A...1..1X/abstract'
    );
  });

  it('builds a search URL with the query and one fq per filter', () => {
    const url = new URL(searchUrl('black hole', [
      'author_facet_hier:"0/Smith, J"',
      'property:"refereed"'
    ]));

    expect(url.origin + url.pathname).toBe('https://scixplorer.org/search');
    expect(url.searchParams.get('q')).toBe('black hole');
    expect(url.searchParams.getAll('fq')).toEqual([
      'author_facet_hier:"0/Smith, J"',
      'property:"refereed"'
    ]);
  });

  it('omits fq entirely when no filters are supplied', () => {
    expect(new URL(searchUrl('star')).searchParams.getAll('fq')).toEqual([]);
  });

  it('routes libraries by visibility', () => {
    expect(libraryUrl('abc123', true)).toBe('https://scixplorer.org/public-libraries/abc123');
    expect(libraryUrl('abc123', false)).toBe('https://scixplorer.org/user/libraries/abc123');
  });
});
