import { z } from 'zod';

export enum ResponseFormat {
  MARKDOWN = 'markdown',
  JSON = 'json'
}

export enum SortOrder {
  RELEVANCE = 'score desc',
  CITATION_COUNT = 'citation_count desc',
  DATE_DESC = 'date desc',
  DATE_ASC = 'date asc',
  READ_COUNT = 'read_count desc'
}

export const SearchInputSchema = z.object({
  query: z.string().min(1).max(1000).describe('SciX search query using Solr syntax'),
  rows: z.number().int().min(1).max(100).default(10).describe('Number of results to return'),
  start: z.number().int().min(0).default(0).describe('Starting offset for pagination'),
  sort: z.enum(SortOrder).default(SortOrder.RELEVANCE).describe('Sort order for results'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN).describe('Output format')
});

export const GetPaperInputSchema = z.object({
  bibcode: z.string().min(1).max(200)
    .describe('Paper identifier: bibcode, DOI, arXiv ID, or SciX ID (scix:...)'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const MetricsInputSchema = z.object({
  bibcodes: z.array(z.string()).min(1).max(2000).describe('List of bibcodes'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const CitationsInputSchema = z.object({
  bibcode: z.string().min(1).max(200)
    .describe('Paper identifier: bibcode, DOI, arXiv ID, or SciX ID (scix:...)'),
  rows: z.number().int().min(1).max(100).default(20).describe('Number of citations to return'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const ExportInputSchema = z.object({
  bibcodes: z.array(z.string()).min(1).max(2000).describe('List of bibcodes to export'),
  format: z.enum([
    'aastex',
    'ads',
    'agu',
    'ams',
    'bibtex',
    'bibtexabs',
    'custom',
    'dcxml',
    'endnote',
    'gsa',
    'icarus',
    'ieee',
    'jatsxml',
    'medlars',
    'mnras',
    'procite',
    'refabsxml',
    'refworks',
    'refxml',
    'ris',
    'rss',
    'soph',
    'votable'
  ]).describe('Export format'),
  custom_format: z.string().optional().describe('Custom format string (required when format is custom)'),
  sort: z.union([z.string(), z.array(z.string())]).optional().describe('Optional sort order (e.g., "date desc")'),
  maxauthor: z.union([z.number().int(), z.array(z.number().int())]).optional().describe('Maximum authors to show before et al.'),
  authorcutoff: z.union([z.number().int(), z.array(z.number().int())]).optional().describe('Author cutoff threshold'),
  journalformat: z.union([z.number().int(), z.array(z.number().int())]).optional().describe('Journal format style code'),
  keyformat: z.union([z.string(), z.array(z.string())]).optional().describe('Citation key format')
}).refine((data) => (data.format === 'custom' ? Boolean(data.custom_format) : true), {
  message: 'custom_format is required when format is custom',
  path: ['custom_format']
});

export type SearchInput = z.infer<typeof SearchInputSchema>;
export type GetPaperInput = z.infer<typeof GetPaperInputSchema>;
export type MetricsInput = z.infer<typeof MetricsInputSchema>;
export type CitationsInput = z.infer<typeof CitationsInputSchema>;
export type ExportInput = z.infer<typeof ExportInputSchema>;

export enum LibraryPermission {
  OWNER = 'owner',
  ADMIN = 'admin',
  WRITE = 'write',
  READ = 'read'
}

export enum LibraryType {
  ALL = 'all',
  OWNER = 'owner',
  COLLABORATOR = 'collaborator'
}

export enum LibraryOperation {
  UNION = 'union',
  INTERSECTION = 'intersection',
  DIFFERENCE = 'difference',
  COPY = 'copy',
  EMPTY = 'empty'
}

export enum DocumentAction {
  ADD = 'add',
  REMOVE = 'remove'
}

export const GetLibrariesInputSchema = z.object({
  type: z.enum(LibraryType).default(LibraryType.ALL).describe('Filter by library type'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const GetLibraryInputSchema = z.object({
  library_id: z.string().min(1).describe('Library identifier'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const CreateLibraryInputSchema = z.object({
  name: z.string().min(1).max(255).describe('Library name'),
  description: z.string().max(1000).optional().describe('Library description'),
  public: z.boolean().default(false).describe('Whether library is public'),
  bibcodes: z.array(z.string()).optional().describe('Initial bibcodes to add'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const DeleteLibraryInputSchema = z.object({
  library_id: z.string().min(1).describe('Library identifier'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const EditLibraryInputSchema = z.object({
  library_id: z.string().min(1).describe('Library identifier'),
  name: z.string().min(1).max(255).optional().describe('New library name'),
  description: z.string().max(1000).optional().describe('New library description'),
  public: z.boolean().optional().describe('Whether library is public'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const ManageDocumentsInputSchema = z.object({
  library_id: z.string().min(1).describe('Library identifier'),
  bibcodes: z.array(z.string()).min(1).max(2000).describe('List of bibcodes'),
  action: z.enum(DocumentAction).describe('Action to perform (add or remove)'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const AddDocumentsByQueryInputSchema = z.object({
  library_id: z.string().min(1).describe('Library identifier'),
  query: z.string().min(1).describe('SciX search query'),
  rows: z.number().int().min(1).max(2000).default(25).describe('Number of results to add'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const LibraryOperationInputSchema = z.object({
  library_id: z.string().min(1).describe('Target library identifier'),
  operation: z.enum(LibraryOperation).describe('Operation to perform'),
  source_library_ids: z.array(z.string()).optional().describe('Source library IDs for union/intersection/difference'),
  name: z.string().optional().describe('Name for new library (for copy operation)'),
  description: z.string().optional().describe('Description for new library (for copy operation)'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const GetPermissionsInputSchema = z.object({
  library_id: z.string().min(1).describe('Library identifier'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const UpdatePermissionsInputSchema = z.object({
  library_id: z.string().min(1).describe('Library identifier'),
  email: z.string().email().describe('User email to grant/modify permissions'),
  permission: z.enum(LibraryPermission).describe('Permission level to grant'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const TransferLibraryInputSchema = z.object({
  library_id: z.string().min(1).describe('Library identifier'),
  email: z.string().email().describe('Email of new owner'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const GetAnnotationInputSchema = z.object({
  library_id: z.string().min(1).describe('Library identifier'),
  bibcode: z.string().min(1).describe('Bibcode to get annotation for'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const ManageAnnotationInputSchema = z.object({
  library_id: z.string().min(1).describe('Library identifier'),
  bibcode: z.string().min(1).describe('Bibcode to annotate'),
  content: z.string().min(1).max(10000).describe('Annotation content'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export const DeleteAnnotationInputSchema = z.object({
  library_id: z.string().min(1).describe('Library identifier'),
  bibcode: z.string().min(1).describe('Bibcode to remove annotation from'),
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export type GetLibrariesInput = z.infer<typeof GetLibrariesInputSchema>;
export type GetLibraryInput = z.infer<typeof GetLibraryInputSchema>;
export type CreateLibraryInput = z.infer<typeof CreateLibraryInputSchema>;
export type DeleteLibraryInput = z.infer<typeof DeleteLibraryInputSchema>;
export type EditLibraryInput = z.infer<typeof EditLibraryInputSchema>;
export type ManageDocumentsInput = z.infer<typeof ManageDocumentsInputSchema>;
export type AddDocumentsByQueryInput = z.infer<typeof AddDocumentsByQueryInputSchema>;
export type LibraryOperationInput = z.infer<typeof LibraryOperationInputSchema>;
export type GetPermissionsInput = z.infer<typeof GetPermissionsInputSchema>;
export type UpdatePermissionsInput = z.infer<typeof UpdatePermissionsInputSchema>;
export type TransferLibraryInput = z.infer<typeof TransferLibraryInputSchema>;
export type GetAnnotationInput = z.infer<typeof GetAnnotationInputSchema>;
export type ManageAnnotationInput = z.infer<typeof ManageAnnotationInputSchema>;
export type DeleteAnnotationInput = z.infer<typeof DeleteAnnotationInputSchema>;

export const SearchDocsInputSchema = z.object({
  query: z.string().min(1).max(500).describe('Natural language search query for documentation'),
  limit: z.number().int().min(1).max(20).default(5).describe('Maximum number of results to return'),
});

export type SearchDocsInput = z.infer<typeof SearchDocsInputSchema>;

export const HealthCheckInputSchema = z.object({
  response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN)
});

export type HealthCheckInput = z.infer<typeof HealthCheckInputSchema>;

export type ProbeState = 'ok' | 'unauthorized' | 'rate_limited' | 'unreachable' | 'skipped';

export interface HealthProbeResult {
  state: ProbeState;
  // Human-readable detail for non-ok states; never contains secret material.
  message?: string;
}

export interface HealthReport {
  server: { name: string; version: string };
  api_base: string;
  token_configured: boolean;
  probe: HealthProbeResult;
  tools: string[];
}

// Consumed subset only, not runtime-validated. Solr fields are optional
// because ADS drops empty ones; formatters guard with `||` / `?.`.
export interface Paper {
  bibcode: string;
  title?: string[];
  author?: string[];
  year?: string | number;
  pub?: string;
  abstract?: string;
  citation_count?: number;
  read_count?: number;
  doi?: string[];
  // identifier entries are not guaranteed strings; formatPaperMarkdown guards.
  identifier?: string | unknown[];
}

export interface SolrResponse {
  response?: {
    numFound?: number;
    start?: number;
    docs?: Paper[];
  };
}

export interface MetricsIndicators {
  h?: number;
  g?: number;
  i10?: number;
  m?: number;
  tori?: number;
}

export interface MetricsCitationStats {
  'total number of citations'?: number;
  'total number of refereed citations'?: number;
  'average number of citations'?: number;
  'median number of citations'?: number;
  'number of self-citations'?: number;
}

export interface MetricsBasicStats {
  'number of papers'?: number;
  'total number of reads'?: number;
  'average number of reads'?: number;
}

export interface Metrics {
  indicators?: MetricsIndicators;
  'citation stats'?: MetricsCitationStats;
  'basic stats'?: MetricsBasicStats;
}

export interface ExportResponse {
  export?: string;
}

export interface LibraryMetadata {
  id: string;
  name: string;
  description: string;
  num_documents: number;
  date_created: string;
  date_last_modified: string;
  permission: string;
  owner: string;
  public: boolean;
  num_users: number;
}

// Library mutations may return metadata at the root or under `metadata`.
export interface LibraryMetadataResponse extends Partial<LibraryMetadata> {
  metadata?: LibraryMetadata;
}

export interface GetLibraryResponse extends LibraryMetadataResponse {
  documents?: string[];
}

export interface LibrariesListResponse {
  libraries?: LibraryMetadata[];
}

export interface DocumentUpdateResponse {
  number_added?: number;
  number_removed?: number;
}

export interface LibraryOperationResponse {
  library_id?: string;
  number_added?: number;
}

export interface PermissionsResponse {
  owner?: string;
  collaborators?: Record<string, string[]>;
}

export interface Annotation {
  id: string;
  bibcode: string;
  content: string;
  date_created: string;
  date_last_modified: string;
}
