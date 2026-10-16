import { SCIX_WEB_BASE } from './config.js';

function absPath(bibcode: string, section: string): string {
  return `${SCIX_WEB_BASE}/abs/${encodeURIComponent(bibcode)}/${section}`;
}

export function abstractUrl(bibcode: string): string {
  return absPath(bibcode, 'abstract');
}

export function citationsUrl(bibcode: string): string {
  return absPath(bibcode, 'citations');
}

export function referencesUrl(bibcode: string): string {
  return absPath(bibcode, 'references');
}

export function searchUrl(query: string, filterQuery: string[] = []): string {
  const url = new URL(`${SCIX_WEB_BASE}/search`);
  url.searchParams.set('q', query);
  for (const filter of filterQuery) {
    url.searchParams.append('fq', filter);
  }
  return url.toString();
}

export function libraryUrl(libraryId: string, isPublic: boolean): string {
  const segment = isPublic ? 'public-libraries' : 'user/libraries';
  return `${SCIX_WEB_BASE}/${segment}/${encodeURIComponent(libraryId)}`;
}
