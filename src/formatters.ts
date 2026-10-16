import type { SearchResult } from './search-docs.js';
import type { HealthReport, Paper, Metrics } from './types.js';
import { abstractUrl, searchUrl } from './scix-urls.js';
import type { FacetGroup } from './facets.js';

const PROBE_LABELS: Record<HealthReport['probe']['state'], string> = {
  ok: 'ok',
  unauthorized: 'unauthorized (401)',
  rate_limited: 'rate limited (429)',
  unreachable: 'unreachable',
  skipped: 'skipped'
};

export function formatHealthCheckMarkdown(report: HealthReport, timeoutMs: number): string {
  const probeLabel = PROBE_LABELS[report.probe.state];
  const probeLine = report.probe.message
    ? `${probeLabel} — ${report.probe.message}`
    : probeLabel;

  let result = `# SciX MCP Health Check\n\n`;
  result += `**Server:** ${report.server.name} v${report.server.version}\n\n`;
  result += `**API base:** ${report.api_base}\n\n`;
  result += `**Token configured:** ${report.token_configured ? 'yes' : 'no'}\n\n`;
  result += `**Auth probe:** ${probeLine}\n\n`;
  result += `_Probe timeout: ${timeoutMs / 1000}s._\n\n`;

  result += `## Registered tools (${report.tools.length})\n\n`;
  result += report.tools.map((name) => `- \`${name}\``).join('\n');
  result += `\n`;

  return result;
}

export function formatDocsSearchMarkdown(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return 'No documentation found for your query.';
  }

  const formatted = results
    .map((r, i) => {
      let text = `## ${i + 1}. ${r.title}\n`;
      if (r.subsection) {
        text += `**Section**: ${r.section} > ${r.subsection}\n`;
      } else if (r.section) {
        text += `**Section**: ${r.section}\n`;
      }
      text += `**Source**: ${r.source_file} ([view online](${r.source_url}))\n`;
      text += `**Relevance**: ${r.score.toFixed(1)}\n\n`;
      text += `${r.snippet}\n`;
      return text;
    })
    .join('\n---\n\n');

  const header = `# SciX Documentation Search Results\n\nFound ${results.length} result${results.length === 1 ? '' : 's'} for "${query}":\n\n`;

  return header + formatted;
}

export function formatPaperMarkdown(paper: Paper): string {
  const authors = paper.author || [];
  const authorStr = authors.length > 3
    ? `${authors.slice(0, 3).join(', ')} et al.`
    : authors.join(', ');

  let result = `# ${paper.title?.[0] || 'Untitled'}\n\n`;
  result += `**Authors:** ${authorStr}\n\n`;
  result += `**Bibcode:** ${paper.bibcode}\n\n`;
  result += `**SciX:** ${abstractUrl(paper.bibcode)}\n\n`;
  result += `**Year:** ${paper.year || 'N/A'}\n\n`;
  result += `**Publication:** ${paper.pub || 'N/A'}\n\n`;

  if (paper.citation_count) {
    result += `**Citations:** ${paper.citation_count}\n\n`;
  }

  if (paper.read_count) {
    result += `**Reads:** ${paper.read_count}\n\n`;
  }

  if (paper.doi?.[0]) {
    result += `**DOI:** https://doi.org/${paper.doi[0]}\n\n`;
  }

  const identifiers = Array.isArray(paper.identifier)
    ? paper.identifier
    : typeof paper.identifier === 'string'
    ? [paper.identifier]
    : [];
  const arxivEntry = identifiers.find(
    (id): id is string => typeof id === 'string' && id.toLowerCase().startsWith('arxiv:')
  );

  if (arxivEntry) {
    result += `**arXiv:** https://arxiv.org/abs/${arxivEntry.slice(6)}\n\n`;
  }

  if (paper.abstract) {
    result += `## Abstract\n\n${paper.abstract}\n\n`;
  }

  return result;
}

function formatPaperListItem(paper: Paper, idx: number): string {
  const firstAuthor = paper.author?.[0] || 'Unknown';
  const title = paper.title?.[0] || 'Untitled';
  const year = paper.year || 'N/A';
  const citations = paper.citation_count || 0;
  return (
    `${idx + 1}. **${title}**\n` +
    `   - ${firstAuthor} (${year})\n` +
    `   - Bibcode: \`${paper.bibcode}\`\n` +
    `   - Citations: ${citations}\n` +
    `   - SciX: ${abstractUrl(paper.bibcode)}\n\n`
  );
}

export function formatPapersListMarkdown(papers: Paper[], total: number): string {
  let result = `# Search Results\n\nFound ${total} total papers, showing ${papers.length}\n\n`;

  papers.forEach((paper, idx) => {
    result += formatPaperListItem(paper, idx);
  });

  return result;
}

function formatFacetGroup(group: FacetGroup): string {
  const shown = group.buckets.length;
  const total = group.total_buckets;
  const scope = total !== undefined && total > shown
    ? `showing ${shown} of ${total}`
    : `${shown}`;

  let result = `## ${group.label} (${scope})\n\n`;
  result += `Field: \`${group.field}\`\n\n`;

  if (shown === 0) {
    return `${result}No values for this facet.\n`;
  }

  for (const bucket of group.buckets) {
    result += `- **${bucket.label}** — ${bucket.count}\n`;
    result += `  - filter_query: \`${bucket.filter}\`\n`;
    if (bucket.child_prefix) {
      result += `  - expandable: prefix \`${bucket.child_prefix}\`\n`;
    }
  }

  return `${result}\n`;
}

export function formatFacetsMarkdown(
  groups: FacetGroup[],
  query: string,
  filterQuery: string[]
): string {
  let result = `# Facets for \`${query}\`\n\n`;

  if (filterQuery.length > 0) {
    result += `Filtered by: ${filterQuery.map((fq) => `\`${fq}\``).join(', ')}\n\n`;
  }

  result += `[View on SciX](${searchUrl(query, filterQuery)})\n\n`;
  result += groups.map(formatFacetGroup).join('');
  result += `Pass any \`filter_query\` value above to \`search\` to narrow results.\n`;

  return result;
}

export function formatMetricsMarkdown(metrics: Metrics): string {
  let result = `# Citation Metrics\n\n`;

  if (metrics.indicators) {
    result += `## Indicators\n\n`;
    result += `- **h-index:** ${metrics.indicators.h || 0}\n`;
    result += `- **g-index:** ${metrics.indicators.g || 0}\n`;
    result += `- **i10-index:** ${metrics.indicators.i10 || 0}\n`;
    result += `- **m-index:** ${metrics.indicators.m?.toFixed(2) || 0}\n`;
    result += `- **tori index:** ${metrics.indicators.tori?.toFixed(2) || 0}\n\n`;
  }

  if (metrics['citation stats']) {
    const stats = metrics['citation stats'];
    result += `## Citation Statistics\n\n`;
    result += `- **Total citations:** ${stats['total number of citations'] || 0}\n`;
    result += `- **Total refereed citations:** ${stats['total number of refereed citations'] || 0}\n`;
    result += `- **Average citations:** ${stats['average number of citations']?.toFixed(1) || 0}\n`;
    result += `- **Median citations:** ${stats['median number of citations'] || 0}\n`;
    result += `- **Self-citations:** ${stats['number of self-citations'] || 0}\n\n`;
  }

  if (metrics['basic stats']) {
    const stats = metrics['basic stats'];
    result += `## Paper Statistics\n\n`;
    result += `- **Total papers:** ${stats['number of papers'] || 0}\n`;
    result += `- **Total reads:** ${stats['total number of reads'] || 0}\n`;
    result += `- **Average reads:** ${stats['average number of reads']?.toFixed(1) || 0}\n\n`;
  }

  return result;
}

export function formatCitationNetworkMarkdown(papers: Paper[], relationship: string, total: number): string {
  let result = `# ${relationship}\n\nFound ${total} total papers, showing ${papers.length}\n\n`;

  papers.forEach((paper, idx) => {
    result += formatPaperListItem(paper, idx);
  });

  return result;
}
