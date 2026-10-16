import { describe, it, expect } from 'vitest';
import {
  formatDocsSearchMarkdown,
  formatPaperMarkdown,
  formatPapersListMarkdown,
  formatMetricsMarkdown,
  formatCitationNetworkMarkdown,
} from '../src/formatters.js';
import type { SearchResult } from '../src/search-docs.js';

function docResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'doc-1',
    title: 'Author Search',
    section: 'Searching',
    subsection: 'By Author',
    source_file: 'searching.md',
    source_url: 'https://scixplorer.org/help/searching',
    doc_type: 'scix_help',
    category: 'search_docs',
    score: 12.34,
    snippet: 'Search by author using author:"Last, F.".',
    ...overrides,
  };
}

describe('formatters', () => {
  describe('formatDocsSearchMarkdown', () => {
    it('returns the no-results message for an empty result set', () => {
      expect(formatDocsSearchMarkdown([], 'author search')).toBe(
        'No documentation found for your query.'
      );
    });

    it('renders header, section, source, relevance, and snippet', () => {
      const md = formatDocsSearchMarkdown([docResult()], 'author search');
      expect(md).toContain('# SciX Documentation Search Results');
      expect(md).toContain('Found 1 result for "author search":');
      expect(md).toContain('## 1. Author Search');
      expect(md).toContain('**Section**: Searching > By Author');
      expect(md).toContain(
        '**Source**: searching.md ([view online](https://scixplorer.org/help/searching))'
      );
      expect(md).toContain('**Relevance**: 12.3');
      expect(md).toContain('Search by author using author:"Last, F.".');
    });

    it('pluralizes the result count and joins entries with a divider', () => {
      const md = formatDocsSearchMarkdown(
        [docResult(), docResult({ id: 'doc-2', title: 'Second' })],
        'q'
      );
      expect(md).toContain('Found 2 results for "q":');
      expect(md).toContain('## 2. Second');
      expect(md).toContain('\n---\n\n');
    });

    it('renders a subsection with an empty section as it appears in the index', () => {
      const md = formatDocsSearchMarkdown([docResult({ section: '' })], 'q');
      expect(md).toContain('**Section**:  > By Author');
    });

    it('renders only the section when no subsection is present', () => {
      const md = formatDocsSearchMarkdown([docResult({ subsection: '' })], 'q');
      expect(md).toContain('**Section**: Searching\n');
      expect(md).not.toContain(' > ');
    });

    it('omits the section line when both section and subsection are empty', () => {
      const md = formatDocsSearchMarkdown(
        [docResult({ section: '', subsection: '' })],
        'q'
      );
      expect(md).not.toContain('**Section**:');
    });
  });

  describe('formatPaperMarkdown', () => {
    const fullPaper = {
      bibcode: '2024ApJ...123..456A',
      title: ['A Study of Black Holes'],
      author: ['Einstein, A.', 'Hawking, S.'],
      year: '2024',
      pub: 'ApJ',
      citation_count: 100,
      read_count: 500,
      doi: ['10.1234/test.doi'],
      identifier: ['2024ApJ...123..456A', 'arXiv:2401.12345', '10.1234/test.doi'],
      abstract: 'We study black holes.',
    };

    it('renders all present fields', () => {
      const md = formatPaperMarkdown(fullPaper);
      expect(md).toContain('# A Study of Black Holes');
      expect(md).toContain('**Authors:** Einstein, A., Hawking, S.');
      expect(md).toContain('**Bibcode:** 2024ApJ...123..456A');
      expect(md).toContain('**Year:** 2024');
      expect(md).toContain('**Publication:** ApJ');
      expect(md).toContain('**Citations:** 100');
      expect(md).toContain('**Reads:** 500');
      expect(md).toContain('**DOI:** https://doi.org/10.1234/test.doi');
      expect(md).toContain('**arXiv:** https://arxiv.org/abs/2401.12345');
      expect(md).toContain('## Abstract\n\nWe study black holes.');
    });

    it('truncates author lists longer than three with "et al."', () => {
      const md = formatPaperMarkdown({
        ...fullPaper,
        author: ['A, A.', 'B, B.', 'C, C.', 'D, D.'],
      });
      expect(md).toContain('**Authors:** A, A., B, B., C, C. et al.');
      expect(md).not.toContain('D, D.');
    });

    it('falls back to Untitled / N/A for missing title, year, and publication', () => {
      const md = formatPaperMarkdown({ bibcode: 'x' });
      expect(md).toContain('# Untitled');
      expect(md).toContain('**Year:** N/A');
      expect(md).toContain('**Publication:** N/A');
      expect(md).toContain('**Authors:** \n');
    });

    it('omits citations, reads, doi, arxiv, and abstract when absent or zero', () => {
      const md = formatPaperMarkdown({
        bibcode: 'x',
        title: ['T'],
        citation_count: 0,
        read_count: 0,
      });
      expect(md).not.toContain('**Citations:**');
      expect(md).not.toContain('**Reads:**');
      expect(md).not.toContain('**DOI:**');
      expect(md).not.toContain('**arXiv:**');
      expect(md).not.toContain('## Abstract');
    });

    it('derives the arXiv link from an arXiv-prefixed identifier entry', () => {
      const md = formatPaperMarkdown({
        bibcode: 'x',
        title: ['T'],
        identifier: ['2024ApJ...123..456A', 'arXiv:2401.12345', '10.1234/test.doi'],
      });
      expect(md).toContain('**arXiv:** https://arxiv.org/abs/2401.12345');
    });

    it('omits the arXiv line when no identifier entry has an arXiv prefix', () => {
      const md = formatPaperMarkdown({
        bibcode: 'x',
        title: ['T'],
        identifier: ['2024ApJ...123..456A', '10.1234/test.doi'],
      });
      expect(md).not.toContain('**arXiv:**');
    });

    it('matches the arXiv prefix case-insensitively, preserving the id body', () => {
      const md = formatPaperMarkdown({
        bibcode: 'x',
        title: ['T'],
        identifier: ['2024ApJ...123..456A', 'arxiv:2401.12345'],
      });
      expect(md).toContain('**arXiv:** https://arxiv.org/abs/2401.12345');
    });

    it('does not throw when identifier is a bare string instead of an array', () => {
      expect(() =>
        formatPaperMarkdown({ bibcode: 'x', title: ['T'], identifier: '2024ApJ...123..456A' })
      ).not.toThrow();
    });

    it('derives the arXiv link from a bare arXiv-prefixed identifier string', () => {
      const md = formatPaperMarkdown({
        bibcode: 'x',
        title: ['T'],
        identifier: 'arXiv:2401.12345',
      });
      expect(md).toContain('**arXiv:** https://arxiv.org/abs/2401.12345');
    });

    it('ignores non-string identifier entries without throwing', () => {
      const md = formatPaperMarkdown({
        bibcode: 'x',
        title: ['T'],
        identifier: [null, 42, 'arXiv:2401.12345'],
      });
      expect(md).toContain('**arXiv:** https://arxiv.org/abs/2401.12345');
    });
  });

  describe('formatPapersListMarkdown', () => {
    it('renders header with total and shown counts plus per-paper entries', () => {
      const md = formatPapersListMarkdown(
        [
          {
            bibcode: '2024A',
            title: ['First'],
            author: ['Alpha, A.', 'Beta, B.'],
            year: '2024',
            citation_count: 7,
          },
        ],
        42
      );
      expect(md).toContain('Found 42 total papers, showing 1');
      expect(md).toContain('1. **First**');
      expect(md).toContain('- Alpha, A. (2024)');
      expect(md).toContain('- Bibcode: `2024A`');
      expect(md).toContain('- Citations: 7');
    });

    it('uses defaults for missing per-paper fields', () => {
      const md = formatPapersListMarkdown([{ bibcode: 'x' }], 1);
      expect(md).toContain('1. **Untitled**');
      expect(md).toContain('- Unknown (N/A)');
      expect(md).toContain('- Citations: 0');
    });

    it('renders only the header for an empty list', () => {
      const md = formatPapersListMarkdown([], 0);
      expect(md).toContain('Found 0 total papers, showing 0');
      expect(md).not.toContain('1. **');
    });

    it('links each paper to its SciX abstract page', () => {
      const md = formatPapersListMarkdown([{ bibcode: '2024ApJ...123..456A' }], 1);
      expect(md).toContain('- SciX: https://scixplorer.org/abs/2024ApJ...123..456A/abstract');
      expect(md).not.toContain('adsabs');
    });
  });

  describe('SciX linking', () => {
    it('gives the detail view a SciX abstract link rather than an ADS one', () => {
      const md = formatPaperMarkdown({ bibcode: '2024ApJ...123..456A' });
      expect(md).toContain('**SciX:** https://scixplorer.org/abs/2024ApJ...123..456A/abstract');
      expect(md).not.toContain('adsabs');
      expect(md).not.toContain('ui.adsabs');
    });
  });

  describe('formatMetricsMarkdown', () => {
    it('renders indicators, citation stats, and basic stats when present', () => {
      const md = formatMetricsMarkdown({
        indicators: { h: 12, g: 20, i10: 8, m: 1.234, tori: 5.678 },
        'citation stats': {
          'total number of citations': 300,
          'total number of refereed citations': 250,
          'average number of citations': 12.34,
          'median number of citations': 9,
          'number of self-citations': 4,
        },
        'basic stats': {
          'number of papers': 25,
          'total number of reads': 1000,
          'average number of reads': 40.5,
        },
      });
      expect(md).toContain('- **h-index:** 12');
      expect(md).toContain('- **m-index:** 1.23');
      expect(md).toContain('- **tori index:** 5.68');
      expect(md).toContain('- **Total citations:** 300');
      expect(md).toContain('- **Average citations:** 12.3');
      expect(md).toContain('- **Total papers:** 25');
      expect(md).toContain('- **Average reads:** 40.5');
    });

    it('renders only the title when metrics object is empty', () => {
      const md = formatMetricsMarkdown({});
      expect(md).toContain('# Citation Metrics');
      expect(md).not.toContain('## Indicators');
      expect(md).not.toContain('## Citation Statistics');
      expect(md).not.toContain('## Paper Statistics');
    });

    it('defaults missing indicator values to 0', () => {
      const md = formatMetricsMarkdown({ indicators: {} });
      expect(md).toContain('- **h-index:** 0');
      expect(md).toContain('- **m-index:** 0');
    });
  });

  describe('formatCitationNetworkMarkdown', () => {
    it('renders the relationship title, counts, and per-paper entries', () => {
      const md = formatCitationNetworkMarkdown(
        [
          {
            bibcode: '2024C',
            title: ['Citing Work'],
            author: ['Gamma, G.'],
            year: '2023',
            citation_count: 3,
          },
        ],
        'Papers citing 2024ApJ...123..456A',
        50
      );
      expect(md).toContain('# Papers citing 2024ApJ...123..456A');
      expect(md).toContain('Found 50 total papers, showing 1');
      expect(md).toContain('1. **Citing Work**');
      expect(md).toContain('- Gamma, G. (2023)');
      expect(md).toContain('- Bibcode: `2024C`');
      expect(md).toContain('- Citations: 3');
    });

    it('renders only the header when there are no related papers', () => {
      const md = formatCitationNetworkMarkdown([], 'Papers referenced by X', 0);
      expect(md).toContain('# Papers referenced by X');
      expect(md).toContain('Found 0 total papers, showing 0');
      expect(md).not.toContain('1. **');
    });
  });
});
