import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

interface MockRequestContext {
  url: URL;
  body: unknown;
}

interface MockResult {
  status?: number;
  body?: unknown;
}

interface MockRoute {
  method: string;
  pattern: RegExp;
  status?: number;
  body?: unknown;
  resolve?: (context: MockRequestContext) => MockResult;
}

const SOLR_RESPONSE = {
  response: {
    numFound: 1,
    start: 0,
    docs: [
      {
        bibcode: '2024SmokeT..42A',
        title: ['Smoke Test Paper Alpha'],
        author: ['Tester, A.'],
        year: 2024,
        pub: 'Journal of Smoke Testing',
        citation_count: 42,
        read_count: 7,
        doi: ['10.1000/smoke.42']
      }
    ]
  }
};

const METRICS_RESPONSE = {
  indicators: { h: 7, g: 9, i10: 5, m: 1.5, tori: 2.25 },
  'citation stats': {
    'total number of citations': 100,
    'total number of refereed citations': 80,
    'average number of citations': 12.5,
    'median number of citations': 10,
    'number of self-citations': 3
  },
  'basic stats': {
    'number of papers': 8,
    'total number of reads': 500,
    'average number of reads': 62.5
  }
};

const LIBRARY_METADATA = {
  id: 'smokeLibId',
  name: 'Smoke Library',
  description: 'A canned library for smoke tests',
  num_documents: 2,
  date_created: '2024-01-01T00:00:00Z',
  date_last_modified: '2024-01-02T00:00:00Z',
  permission: 'owner',
  owner: 'owner@example.com',
  public: false,
  num_users: 1
};

interface StoredLibrary {
  id: string;
  name: string;
  description: string;
  public: boolean;
  documents: string[];
}

function readBibcodes(body: unknown): string[] {
  const value = (body as { bibcode?: unknown } | null)?.bibcode;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function libraryStore() {
  const libraries = new Map<string, StoredLibrary>();
  let nextId = 1;

  const seed = () => {
    libraries.clear();
    nextId = 1;
    libraries.set('smokeLibId', {
      id: 'smokeLibId',
      name: 'Smoke Library Detail',
      description: 'A canned library for smoke tests',
      public: false,
      documents: ['2024SmokeT..42A', '2024SmokeT..43B']
    });
    libraries.set('deletableLibId', {
      id: 'deletableLibId',
      name: 'Deletable Smoke Library',
      description: 'Target for the delete_library smoke case',
      public: false,
      documents: []
    });
  };

  seed();

  return {
    seed,
    get: (id: string) => libraries.get(id),
    list: () => [...libraries.values()],
    create: (body: unknown): StoredLibrary => {
      const fields = (body ?? {}) as Record<string, unknown>;
      const library: StoredLibrary = {
        id: `createdLibId${nextId++}`,
        name: typeof fields.name === 'string' ? fields.name : 'Untitled',
        description: typeof fields.description === 'string' ? fields.description : '',
        public: fields.public === true,
        documents: readBibcodes(body)
      };
      libraries.set(library.id, library);
      return library;
    },
    remove: (id: string) => libraries.delete(id)
  };
}

type LibraryStore = ReturnType<typeof libraryStore>;

function libraryIdFrom(url: URL): string {
  const segments = url.pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

function notesTargetFrom(url: URL): { libraryId: string; bibcode: string } {
  const segments = url.pathname.split('/').filter(Boolean);
  return {
    libraryId: segments[segments.length - 2] ?? '',
    bibcode: segments[segments.length - 1] ?? ''
  };
}

interface StoredNote {
  id: string;
  content: string;
  bibcode: string;
  library_id: string;
  date_created: string;
  date_last_modified: string;
}

function readContent(body: unknown): string | undefined {
  const value = (body as { content?: unknown } | null)?.content;
  return typeof value === 'string' ? value : undefined;
}

function noteStore(libraries: LibraryStore) {
  const notes = new Map<string, StoredNote>();
  let nextId = 1;

  const key = (libraryId: string, bibcode: string) => `${libraryId}::${bibcode}`;

  const envelope = (note: StoredNote): MockResult => {
    const library = libraries.get(note.library_id);
    return {
      body: {
        document: note.bibcode,
        note: { ...note },
        library_metadata: library ? toMetadata(library) : undefined
      }
    };
  };

  const absent: MockResult = { status: 400, body: { error: 'no note for this document' } };

  return {
    seed: () => {
      notes.clear();
      nextId = 1;
      notes.set(key('smokeLibId', '2024SmokeT..42A'), {
        id: 'noteId',
        content: 'Smoke annotation body',
        bibcode: '2024SmokeT..42A',
        library_id: 'smokeLibId',
        date_created: '2024-01-01T00:00:00Z',
        date_last_modified: '2024-01-02T00:00:00Z'
      });
    },
    content: (libraryId: string, bibcode: string) => notes.get(key(libraryId, bibcode))?.content,
    read: (url: URL): MockResult => {
      const { libraryId, bibcode } = notesTargetFrom(url);
      const note = notes.get(key(libraryId, bibcode));
      return note ? envelope(note) : absent;
    },
    create: (url: URL, body: unknown): MockResult => {
      const { libraryId, bibcode } = notesTargetFrom(url);
      const content = readContent(body);
      if (content === undefined) {
        return { status: 400, body: { error: 'content is required' } };
      }
      if (notes.has(key(libraryId, bibcode))) {
        return { status: 409, body: { error: 'note already exists' } };
      }

      const note: StoredNote = {
        id: `noteId${nextId++}`,
        content,
        bibcode,
        library_id: libraryId,
        date_created: '2024-03-01T00:00:00Z',
        date_last_modified: '2024-03-01T00:00:00Z'
      };
      notes.set(key(libraryId, bibcode), note);
      return envelope(note);
    },
    update: (url: URL, body: unknown): MockResult => {
      const { libraryId, bibcode } = notesTargetFrom(url);
      const note = notes.get(key(libraryId, bibcode));
      if (!note) {
        return absent;
      }
      const content = readContent(body);
      if (content === undefined) {
        return { status: 400, body: { error: 'content is required' } };
      }

      note.content = content;
      note.date_last_modified = '2024-03-02T00:00:00Z';
      return envelope(note);
    },
    remove: (url: URL): MockResult => {
      const { libraryId, bibcode } = notesTargetFrom(url);
      if (!notes.delete(key(libraryId, bibcode))) {
        return absent;
      }
      return { body: {} };
    }
  };
}

type NoteStore = ReturnType<typeof noteStore>;

const GRANT_FLAGS = ['read', 'write', 'admin'] as const;

function readGrant(body: unknown): string[] | undefined {
  const value = (body as { permission?: unknown } | null)?.permission;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const flags = value as Record<string, unknown>;
  for (const key of Object.keys(flags)) {
    if (!GRANT_FLAGS.includes(key as (typeof GRANT_FLAGS)[number])) {
      return undefined;
    }
  }

  return GRANT_FLAGS.filter((flag) => flags[flag] === true);
}

function permissionStore() {
  const byLibrary = new Map<string, Map<string, string[]>>();

  const seed = () => {
    byLibrary.clear();
    byLibrary.set(
      'smokeLibId',
      new Map([
        ['owner@example.com', ['owner']],
        ['collab@example.com', ['read']]
      ])
    );
  };

  seed();

  return {
    seed,
    granted: (libraryId: string, email: string) => byLibrary.get(libraryId)?.get(email),
    list: (libraryId: string) =>
      [...(byLibrary.get(libraryId) ?? new Map<string, string[]>()).entries()].map(
        ([email, granted]) => ({ [email]: granted })
      ),
    update: (libraryId: string, body: unknown): MockResult => {
      const email = (body as { email?: unknown } | null)?.email;
      if (typeof email !== 'string') {
        return { status: 400, body: { error: 'email is required' } };
      }

      const granted = readGrant(body);
      if (!granted) {
        return { status: 400, body: { error: 'permission must be a boolean flag map' } };
      }

      const library = byLibrary.get(libraryId) ?? new Map<string, string[]>();
      byLibrary.set(libraryId, library);

      if (granted.length === 0) {
        library.delete(email);
      } else {
        library.set(email, granted);
      }

      return { body: {} };
    }
  };
}

type PermissionStore = ReturnType<typeof permissionStore>;

function toMetadata(library: StoredLibrary) {
  return {
    ...LIBRARY_METADATA,
    id: library.id,
    name: library.name,
    description: library.description,
    public: library.public,
    num_documents: library.documents.length
  };
}

function resolveSearch({ url }: MockRequestContext): MockResult {
  const requested = url.searchParams.get('json.facet');
  if (!requested) {
    return { body: SOLR_RESPONSE };
  }

  const fields = Object.keys(JSON.parse(requested) as Record<string, unknown>);
  const facets: Record<string, unknown> = { count: 1 };
  for (const field of fields) {
    const hierarchical = field.endsWith('_hier') || field.endsWith('_hier_3level');
    facets[field] = {
      numBuckets: 9,
      buckets: [{ val: hierarchical ? '0/Tester, A' : 'smoke-value', count: 42 }]
    };
  }

  return { body: { response: { numFound: 1, docs: [] }, facets } };
}

// Ordered most-specific first; first match wins.
function createRoutes(
  libraries: LibraryStore,
  notes: NoteStore,
  permissions: PermissionStore
): MockRoute[] {
  return [
    { method: 'GET', pattern: /^\/search\/query$/, resolve: resolveSearch },
    { method: 'POST', pattern: /^\/metrics$/, body: METRICS_RESPONSE },
    {
      method: 'POST',
      pattern: /^\/export\/[^/]+$/,
      body: { export: '@ARTICLE{smoke2024, title="Smoke Test Paper Alpha"}' }
    },

    {
      method: 'GET',
      pattern: /^\/biblib\/notes\/[^/]+\/[^/]+$/,
      resolve: ({ url }) => notes.read(url)
    },
    {
      method: 'POST',
      pattern: /^\/biblib\/notes\/[^/]+\/[^/]+$/,
      resolve: ({ url, body }) => notes.create(url, body)
    },
    {
      method: 'PUT',
      pattern: /^\/biblib\/notes\/[^/]+\/[^/]+$/,
      resolve: ({ url, body }) => notes.update(url, body)
    },
    {
      method: 'DELETE',
      pattern: /^\/biblib\/notes\/[^/]+\/[^/]+$/,
      resolve: ({ url }) => notes.remove(url)
    },

    {
      method: 'POST',
      pattern: /^\/biblib\/libraries\/operations\/[^/]+$/,
      resolve: ({ url, body }) => {
        const fields = (body ?? {}) as Record<string, unknown>;

        if (fields.action === 'empty') {
          const library = libraries.get(libraryIdFrom(url));
          if (library) {
            library.documents = [];
          }
          return { body: {} };
        }

        const created = libraries.create({
          name: fields.name ?? 'Operation Result',
          description: fields.description,
          public: fields.public
        });
        return {
          body: { name: created.name, id: created.id, description: created.description }
        };
      }
    },
    {
      method: 'GET',
      pattern: /^\/biblib\/libraries$/,
      resolve: () => ({ body: { libraries: libraries.list().map(toMetadata) } })
    },
    {
      method: 'POST',
      pattern: /^\/biblib\/libraries$/,
      resolve: ({ body }) => {
        const created = libraries.create(body);
        return {
          body: { name: created.name, id: created.id, description: created.description }
        };
      }
    },
    {
      method: 'GET',
      pattern: /^\/biblib\/libraries\/[^/]+$/,
      resolve: ({ url }) => {
        const library = libraries.get(libraryIdFrom(url));
        if (!library) {
          return { status: 404, body: { error: 'library not found' } };
        }
        return { body: { metadata: toMetadata(library), documents: [...library.documents] } };
      }
    },

    { method: 'POST', pattern: /^\/biblib\/documents\/[^/]+\/query$/, body: { number_added: 3 } },
    {
      method: 'POST',
      pattern: /^\/biblib\/documents\/[^/]+$/,
      resolve: ({ url, body }) => {
        const library = libraries.get(libraryIdFrom(url));
        if (!library) {
          return { status: 404, body: { error: 'library not found' } };
        }

        const bibcodes = readBibcodes(body);
        const action = (body as { action?: unknown } | null)?.action;

        if (action === 'remove') {
          const before = library.documents.length;
          library.documents = library.documents.filter((entry) => !bibcodes.includes(entry));
          return { body: { number_removed: before - library.documents.length } };
        }

        const added = bibcodes.filter((entry) => !library.documents.includes(entry));
        library.documents.push(...added);
        return { body: { number_added: added.length } };
      }
    },
    {
      method: 'PUT',
      pattern: /^\/biblib\/documents\/[^/]+$/,
      resolve: ({ url, body }) => {
        const library = libraries.get(libraryIdFrom(url));
        if (!library) {
          return { status: 404, body: { error: 'library not found' } };
        }

        const fields = (body ?? {}) as Record<string, unknown>;
        const echoed: Record<string, unknown> = {};

        if (typeof fields.name === 'string') {
          library.name = fields.name;
          echoed.name = library.name;
        }
        if (typeof fields.description === 'string') {
          library.description = fields.description;
          echoed.description = library.description;
        }
        if (typeof fields.public === 'boolean') {
          library.public = fields.public;
          echoed.public = library.public;
        }

        return { body: echoed };
      }
    },
    {
      method: 'DELETE',
      pattern: /^\/biblib\/documents\/[^/]+$/,
      resolve: ({ url }) => {
        libraries.remove(libraryIdFrom(url));
        return { body: {} };
      }
    },

    {
      method: 'GET',
      pattern: /^\/biblib\/permissions\/[^/]+$/,
      resolve: ({ url }) => ({ body: permissions.list(libraryIdFrom(url)) })
    },
    {
      method: 'POST',
      pattern: /^\/biblib\/permissions\/[^/]+$/,
      resolve: ({ url, body }) => permissions.update(libraryIdFrom(url), body)
    },
    { method: 'POST', pattern: /^\/biblib\/transfer\/[^/]+$/, body: {} }
  ];
}

export interface RecordedRequest {
  method: string;
  pathname: string;
  query?: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
}

export interface MockAdsServer {
  url: string;
  requests: RecordedRequest[];
  // Requests whose socket closed before the mock answered — i.e. the client
  // cancelled in flight.
  aborted: RecordedRequest[];
  libraryDocuments: (id: string) => string[] | undefined;
  noteContent: (libraryId: string, bibcode: string) => string | undefined;
  grantedPermission: (libraryId: string, email: string) => string[] | undefined;
  setDelay: (ms: number) => void;
  reset: () => void;
  close: () => Promise<void>;
}

function parseBody(raw: string): unknown {
  if (raw.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function startMockAdsServer(): Promise<MockAdsServer> {
  const requests: RecordedRequest[] = [];
  const aborted: RecordedRequest[] = [];
  const libraries = libraryStore();
  const notes = noteStore(libraries);
  notes.seed();
  const permissions = permissionStore();
  const routes = createRoutes(libraries, notes, permissions);
  let delayMs = 0;
  const pending = new Set<ReturnType<typeof setTimeout>>();

  const server: Server = createServer((req, res) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;
    const route = routes.find((r) => r.method === method && r.pattern.test(pathname));

    const recorded: RecordedRequest = {
      method,
      pathname,
      query: url.search,
      headers: {
        authorization: req.headers.authorization,
        'user-agent': req.headers['user-agent'],
        'x-client-source': Array.isArray(req.headers['x-client-source'])
          ? req.headers['x-client-source'].join(',')
          : req.headers['x-client-source']
      }
    };
    requests.push(recorded);

    res.on('close', () => {
      if (!res.writableEnded) {
        aborted.push(recorded);
      }
    });

    const respond = () => {
      if (res.writableEnded || res.destroyed) {
        return;
      }

      if (!route) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `no mock route for ${method} ${pathname}` }));
        return;
      }

      const result: MockResult = route.resolve
        ? route.resolve({ url, body: recorded.body })
        : { status: route.status, body: route.body };
      res.writeHead(result.status ?? route.status ?? 200, { 'Content-Type': 'application/json' });
      res.end(result.body === undefined ? '' : JSON.stringify(result.body));
    };

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      recorded.body = parseBody(Buffer.concat(chunks).toString('utf8'));

      if (delayMs > 0) {
        const timer = setTimeout(() => {
          pending.delete(timer);
          respond();
        }, delayMs);
        pending.add(timer);
        return;
      }

      respond();
    });
  });

  // A bind failure (EADDRINUSE, EPERM) must reject fast, not hang until the
  // beforeAll timeout on an unhandled 'error' event.
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    aborted,
    libraryDocuments: (id: string) => {
      const library = libraries.get(id);
      return library ? [...library.documents] : undefined;
    },
    noteContent: (libraryId: string, bibcode: string) => notes.content(libraryId, bibcode),
    grantedPermission: (libraryId: string, email: string) => permissions.granted(libraryId, email),
    setDelay: (ms: number) => {
      delayMs = ms;
    },
    reset: () => {
      requests.length = 0;
      aborted.length = 0;
      delayMs = 0;
      libraries.seed();
      notes.seed();
      permissions.seed();
      pending.forEach(clearTimeout);
      pending.clear();
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      )
  };
}
