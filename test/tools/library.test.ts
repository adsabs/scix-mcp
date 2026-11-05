import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SciXAPIClient } from '../../src/client.js';
import { setupMockFetch, setupMockFetchSequence, restoreFetch } from '../helpers/mockFetch.js';
import {
  getLibraries,
  getLibrary,
  createLibrary,
  deleteLibrary,
  editLibrary,
  manageDocuments,
  addDocumentsByQuery,
  libraryOperation,
  getPermissions,
  updatePermissions,
  transferLibrary,
  getAnnotation,
  manageAnnotation,
  deleteAnnotation
} from '../../src/tools/library.js';
import { ResponseFormat, DocumentAction, LibraryOperation, LibraryPermission } from '../../src/types.js';

describe('Library Tools', () => {
  let client: SciXAPIClient;
  const originalEnv = process.env.SCIX_API_TOKEN;

  beforeEach(() => {
    process.env.SCIX_API_TOKEN = 'test-api-key';
    client = new SciXAPIClient();
  });

  afterEach(() => {
    restoreFetch();
    process.env.SCIX_API_TOKEN = originalEnv;
  });

  describe('getLibraries', () => {
    it('should fetch all libraries', async () => {
      const mockLibraries = {
        libraries: [
          {
            id: 'lib1',
            name: 'My Library',
            description: 'Test library',
            num_documents: 10,
            date_created: '2024-01-01',
            date_last_modified: '2024-01-02',
            permission: 'owner',
            owner: 'user@example.com',
            public: false,
            num_users: 1
          }
        ]
      };

      const mockFetch = setupMockFetch({ body: mockLibraries });

      const result = await getLibraries(client, {
        type: 'all',
        response_format: ResponseFormat.MARKDOWN
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/libraries');
      expect(result).toContain('My Library');
      expect(result).toContain('lib1');
    });

    it('should filter by access type', async () => {
      const mockFetch = setupMockFetch({ body: { libraries: [] } });

      await getLibraries(client, {
        type: 'owner',
        response_format: ResponseFormat.MARKDOWN
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('access_type=owner');
    });

    it('should return JSON format', async () => {
      const mockLibraries = {
        libraries: [{ id: 'lib1', name: 'Test' }]
      };

      setupMockFetch({ body: mockLibraries });

      const result = await getLibraries(client, {
        type: 'all',
        response_format: ResponseFormat.JSON
      });

      const parsed = JSON.parse(result);
      expect(parsed).toEqual(mockLibraries.libraries);
    });
  });

  describe('getLibrary', () => {
    it('should fetch single library with documents', async () => {
      const mockData = {
        metadata: {
          id: 'lib1',
          name: 'My Library',
          description: 'Test',
          num_documents: 2,
          date_created: '2024-01-01',
          date_last_modified: '2024-01-02',
          permission: 'owner',
          owner: 'user@example.com',
          public: false,
          num_users: 1
        },
        documents: ['2024ApJ...123..456A', '2024MNRAS.789..012B']
      };

      const mockFetch = setupMockFetch({ body: mockData });

      const result = await getLibrary(client, {
        library_id: 'lib1',
        response_format: ResponseFormat.MARKDOWN
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/libraries/lib1');
      expect(result).toContain('My Library');
      expect(result).toContain('2024ApJ...123..456A');
    });

    it('should return JSON format', async () => {
      const mockData = {
        metadata: { id: 'lib1', name: 'Test' },
        documents: ['bibcode1']
      };

      setupMockFetch({ body: mockData });

      const result = await getLibrary(client, {
        library_id: 'lib1',
        response_format: ResponseFormat.JSON
      });

      const parsed = JSON.parse(result);
      expect(parsed).toEqual(mockData);
    });

    it('should handle library metadata returned at root level', async () => {
      const mockData = {
        id: 'lib1',
        name: 'Root Library',
        description: 'Test',
        num_documents: 0,
        date_created: '2024-01-01',
        date_last_modified: '2024-01-02',
        permission: 'owner',
        owner: 'user@example.com',
        public: false,
        num_users: 1,
        documents: []
      };

      setupMockFetch({ body: mockData });

      const result = await getLibrary(client, {
        library_id: 'lib1',
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).toContain('Root Library');
      expect(result).toContain('No documents');
    });
  });

  describe('createLibrary', () => {
    it('should create library with all fields', async () => {
      const mockResponse = {
        metadata: {
          id: 'newlib',
          name: 'New Library',
          description: 'Description',
          num_documents: 2,
          date_created: '2024-01-01',
          public: true
        }
      };

      const mockFetch = setupMockFetch({ body: mockResponse });

      const result = await createLibrary(client, {
        name: 'New Library',
        description: 'Description',
        public: true,
        bibcodes: ['bibcode1', 'bibcode2'],
        response_format: ResponseFormat.MARKDOWN
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/libraries');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body);
      expect(body.name).toBe('New Library');
      expect(body.description).toBe('Description');
      expect(body.public).toBe(true);
      expect(body.bibcode).toEqual(['bibcode1', 'bibcode2']);
      expect(body.bibcodes).toBeUndefined();

      expect(result).toContain('Library created successfully');
      expect(result).toContain('newlib');
    });

    it('should create library without bibcodes', async () => {
      const mockResponse = {
        metadata: { id: 'lib', name: 'Test', num_documents: 0 }
      };

      const mockFetch = setupMockFetch({ body: mockResponse });

      await createLibrary(client, {
        name: 'Test',
        public: false,
        response_format: ResponseFormat.MARKDOWN
      });

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.bibcode).toBeUndefined();
    });

    it('reports the submitted document count when the response omits it', async () => {
      setupMockFetch({
        body: { name: 'New Library', id: 'newlib', description: 'Description' }
      });

      const result = await createLibrary(client, {
        name: 'New Library',
        public: false,
        bibcodes: ['bibcode1', 'bibcode2'],
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).toContain('**Documents**: 2');
      expect(result).not.toContain('undefined');
    });

    it('should handle create responses without metadata wrapper', async () => {
      const mockResponse = {
        id: 'rootlib',
        name: 'Root Create',
        description: 'Direct payload',
        num_documents: 0,
        date_created: '2024-01-01'
      };

      const mockFetch = setupMockFetch({ body: mockResponse });

      const result = await createLibrary(client, {
        name: 'Root Create',
        public: false,
        response_format: ResponseFormat.MARKDOWN
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toContain('Root Create');
      expect(result).toContain('rootlib');
    });
  });

  describe('deleteLibrary', () => {
    it('should delete library', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      const result = await deleteLibrary(client, {
        library_id: 'lib1',
        response_format: ResponseFormat.MARKDOWN
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/documents/lib1');
      expect(init.method).toBe('DELETE');
      expect(result).toContain('deleted successfully');
    });

    it('should return JSON format', async () => {
      setupMockFetch({ body: {} });

      const result = await deleteLibrary(client, {
        library_id: 'lib1',
        response_format: ResponseFormat.JSON
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.library_id).toBe('lib1');
    });
  });

  describe('editLibrary', () => {
    it('should update all fields', async () => {
      const mockResponse = {
        metadata: {
          id: 'lib1',
          name: 'Updated Name',
          description: 'Updated Description',
          public: true,
          date_last_modified: '2024-01-03'
        }
      };

      const mockFetch = setupMockFetch({ body: mockResponse });

      const result = await editLibrary(client, {
        library_id: 'lib1',
        name: 'Updated Name',
        description: 'Updated Description',
        public: true,
        response_format: ResponseFormat.MARKDOWN
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/documents/lib1');
      expect(init.method).toBe('PUT');

      const body = JSON.parse(init.body);
      expect(body.name).toBe('Updated Name');
      expect(body.description).toBe('Updated Description');
      expect(body.public).toBe(true);

      expect(result).toContain('Library updated successfully');
    });

    it('should update only specified fields', async () => {
      const mockResponse = {
        metadata: { id: 'lib1', name: 'New Name', date_last_modified: '2024-01-03' }
      };

      const mockFetch = setupMockFetch({ body: mockResponse });

      await editLibrary(client, {
        library_id: 'lib1',
        name: 'New Name',
        response_format: ResponseFormat.MARKDOWN
      });

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.name).toBe('New Name');
      expect(body.description).toBeUndefined();
      expect(body.public).toBeUndefined();
    });

    it('succeeds when the response echoes only the submitted fields', async () => {
      setupMockFetch({ body: { description: 'Just the description' } });

      const result = await editLibrary(client, {
        library_id: 'lib1',
        description: 'Just the description',
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).toContain('Library updated successfully');
      expect(result).toContain('**Description**: Just the description');
      expect(result).not.toContain('undefined');
      expect(result).not.toContain('**Name**');
    });

    it('falls back to the submitted values when the response is empty', async () => {
      setupMockFetch({ body: {} });

      const result = await editLibrary(client, {
        library_id: 'lib1',
        name: 'Renamed',
        public: true,
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).toContain('**Name**: Renamed');
      expect(result).toContain('**Public**: Yes');
      expect(result).not.toContain('undefined');
    });
  });

  describe('manageDocuments', () => {
    it('should add documents', async () => {
      const mockResponse = { number_added: 3 };
      const mockFetch = setupMockFetch({ body: mockResponse });

      const result = await manageDocuments(client, {
        library_id: 'lib1',
        bibcodes: ['bib1', 'bib2', 'bib3'],
        action: DocumentAction.ADD,
        response_format: ResponseFormat.MARKDOWN
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/documents/lib1');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body);
      expect(body.bibcode).toEqual(['bib1', 'bib2', 'bib3']);
      expect(body.action).toBe('add');

      expect(result).toContain('3 documents added to library');
    });

    it('should remove documents', async () => {
      const mockResponse = { number_removed: 2 };
      setupMockFetch({ body: mockResponse });

      const result = await manageDocuments(client, {
        library_id: 'lib1',
        bibcodes: ['bib1', 'bib2'],
        action: DocumentAction.REMOVE,
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).toContain('2 documents removed from library');
    });
  });

  describe('addDocumentsByQuery', () => {
    it('searches then adds the resulting bibcodes', async () => {
      const searchResponse = {
        response: { docs: [{ bibcode: 'bib1' }, { bibcode: 'bib2' }] }
      };

      const mockFetch = setupMockFetchSequence([
        { body: searchResponse },
        { body: { number_added: 2 } }
      ]);

      const result = await addDocumentsByQuery(client, {
        library_id: 'lib1',
        query: 'author:"Einstein"',
        rows: 20,
        response_format: ResponseFormat.MARKDOWN
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);

      const [searchUrl] = mockFetch.mock.calls[0];
      expect(searchUrl).toContain('search/query');
      expect(searchUrl).toContain('rows=20');

      const [addUrl, addInit] = mockFetch.mock.calls[1];
      expect(addUrl).toContain('biblib/documents/lib1');
      expect(addInit.method).toBe('POST');

      const body = JSON.parse(addInit.body);
      expect(body.bibcode).toEqual(['bib1', 'bib2']);
      expect(body.action).toBe('add');

      expect(result).toContain('Documents added to library');
      expect(result).toContain('2');
    });

    it('never calls the biblib query endpoint', async () => {
      const mockFetch = setupMockFetchSequence([
        { body: { response: { docs: [{ bibcode: 'bib1' }] } } },
        { body: { number_added: 1 } }
      ]);

      await addDocumentsByQuery(client, {
        library_id: 'lib1',
        query: 'black hole',
        rows: 1,
        response_format: ResponseFormat.MARKDOWN
      });

      const urls = mockFetch.mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url.includes('/query') && url.includes('biblib'))).toBe(false);
    });

    it('propagates a search failure instead of reporting success', async () => {
      setupMockFetch({ status: 500, body: { error: 'boom' } });

      await expect(
        addDocumentsByQuery(client, {
          library_id: 'lib1',
          query: 'black hole',
          rows: 2,
          response_format: ResponseFormat.MARKDOWN
        })
      ).rejects.toThrow();
    });

    it('should respond gracefully when search finds no documents', async () => {
      const mockFetch = setupMockFetch({ body: { response: { docs: [] } } });

      const result = await addDocumentsByQuery(client, {
        library_id: 'lib1',
        query: 'noresults',
        rows: 5,
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).toContain("No documents found for query 'noresults'");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('libraryOperation', () => {
    it('should perform union operation', async () => {
      const mockResponse = { id: 'newlib', name: 'Merged', description: '' };
      const mockFetch = setupMockFetch({ body: mockResponse });

      const result = await libraryOperation(client, {
        library_id: 'lib1',
        operation: LibraryOperation.UNION,
        source_library_ids: ['lib2', 'lib3'],
        name: 'Merged',
        description: 'Union of two libraries',
        public: true,
        response_format: ResponseFormat.MARKDOWN
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/libraries/operations/lib1');

      const body = JSON.parse(init.body);
      expect(body.action).toBe('union');
      expect(body.libraries).toEqual(['lib2', 'lib3']);
      expect(body.name).toBe('Merged');
      expect(body.description).toBe('Union of two libraries');
      expect(body.public).toBe(true);

      expect(result).toContain('union');
      expect(result).toContain('newlib');
    });

    it('reports the new library id from the response id field', async () => {
      setupMockFetch({ body: { id: 'newlib', name: 'Merged' } });

      const result = await libraryOperation(client, {
        library_id: 'lib1',
        operation: LibraryOperation.INTERSECTION,
        source_library_ids: ['lib2'],
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).toContain('**New Library ID**: newlib');
    });

    it('omits name and description for copy, which biblib ignores', async () => {
      const mockFetch = setupMockFetch({ body: { id: 'copied-lib' } });

      await libraryOperation(client, {
        library_id: 'lib1',
        operation: LibraryOperation.COPY,
        source_library_ids: ['lib2'],
        name: 'Copy of Library',
        description: 'Copied library',
        response_format: ResponseFormat.MARKDOWN
      });

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.action).toBe('copy');
      expect(body.libraries).toEqual(['lib2']);
      expect(body.name).toBeUndefined();
      expect(body.description).toBeUndefined();
    });

    it('should perform empty operation', async () => {
      const mockResponse = { number_added: 0 };
      const mockFetch = setupMockFetch({ body: mockResponse });

      await libraryOperation(client, {
        library_id: 'lib1',
        operation: LibraryOperation.EMPTY,
        response_format: ResponseFormat.MARKDOWN
      });

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.action).toBe('empty');
      expect(body.libraries).toBeUndefined();
    });
  });

  describe('getPermissions', () => {
    const permissionsList = [
      { 'owner@example.com': ['owner'] },
      { 'user1@example.com': ['read'] },
      { 'user2@example.com': ['read', 'write'] }
    ];

    it('should fetch permissions', async () => {
      const mockFetch = setupMockFetch({ body: permissionsList });

      const result = await getPermissions(client, {
        library_id: 'lib1',
        response_format: ResponseFormat.MARKDOWN
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/permissions/lib1');

      expect(result).toContain('**Owner**: owner@example.com');
      expect(result).toContain('user1@example.com');
      expect(result).toContain('user2@example.com');
      expect(result).not.toContain('No collaborators.');
    });

    it('reports the highest grant each collaborator holds', async () => {
      setupMockFetch({ body: permissionsList });

      const result = await getPermissions(client, {
        library_id: 'lib1',
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).toContain('- **user1@example.com**: read');
      expect(result).toContain('- **user2@example.com**: write');
    });

    it('reports no collaborators when only the owner is listed', async () => {
      setupMockFetch({ body: [{ 'owner@example.com': ['owner'] }] });

      const result = await getPermissions(client, {
        library_id: 'lib1',
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).toContain('**Owner**: owner@example.com');
      expect(result).toContain('No collaborators.');
    });
  });

  describe('updatePermissions', () => {
    it('sends biblib a boolean flag map with one grant set', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      const result = await updatePermissions(client, {
        library_id: 'lib1',
        email: 'user@example.com',
        permission: LibraryPermission.WRITE,
        response_format: ResponseFormat.MARKDOWN
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/permissions/lib1');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body);
      expect(body.email).toBe('user@example.com');
      expect(body.permission).toEqual({ read: false, write: true, admin: false });

      expect(result).toContain('Permissions updated successfully');
    });

    it('revokes every grant when permission is none', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      const result = await updatePermissions(client, {
        library_id: 'lib1',
        email: 'user@example.com',
        permission: LibraryPermission.NONE,
        response_format: ResponseFormat.MARKDOWN
      });

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.permission).toEqual({ read: false, write: false, admin: false });

      expect(result).toContain('Access revoked for user@example.com');
    });
  });

  describe('transferLibrary', () => {
    it('should transfer library', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      const result = await transferLibrary(client, {
        library_id: 'lib1',
        email: 'newowner@example.com',
        response_format: ResponseFormat.MARKDOWN
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/transfer/lib1');

      const body = JSON.parse(init.body);
      expect(body.email).toBe('newowner@example.com');

      expect(result).toContain('transferred successfully');
      expect(result).toContain('newowner@example.com');
    });
  });

  describe('getAnnotation', () => {
    const noteEnvelope = {
      document: '2024ApJ...123..456A',
      note: {
        id: 'note1',
        bibcode: '2024ApJ...123..456A',
        library_id: 'lib1',
        content: 'This is my note',
        date_created: '2024-01-01',
        date_last_modified: '2024-01-02'
      },
      library_metadata: { id: 'lib1', name: 'My Library' }
    };

    it('should fetch annotation', async () => {
      const mockFetch = setupMockFetch({ body: noteEnvelope });

      const result = await getAnnotation(client, {
        library_id: 'lib1',
        bibcode: '2024ApJ...123..456A',
        response_format: ResponseFormat.MARKDOWN
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/notes/lib1/2024ApJ...123..456A');
      expect(url).not.toContain('biblib/libraries');

      expect(result).toContain('This is my note');
      expect(result).toContain('2024ApJ...123..456A');
    });

    it('should handle missing annotation', async () => {
      setupMockFetch({ body: {} });

      const result = await getAnnotation(client, {
        library_id: 'lib1',
        bibcode: '2024ApJ...123..456A',
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).toContain('No annotation found');
    });

    it('treats a 400 from biblib as an absent note', async () => {
      setupMockFetch({ status: 400, body: { error: 'no note' } });

      const result = await getAnnotation(client, {
        library_id: 'lib1',
        bibcode: '2024ApJ...123..456A',
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).toContain('No annotation found');
    });

    it('still surfaces unrelated errors', async () => {
      setupMockFetch({ status: 500, body: { error: 'boom' } });

      await expect(
        getAnnotation(client, {
          library_id: 'lib1',
          bibcode: '2024ApJ...123..456A',
          response_format: ResponseFormat.MARKDOWN
        })
      ).rejects.toThrow();
    });
  });

  describe('manageAnnotation', () => {
    it('posts a new note when the document has none', async () => {
      const mockFetch = setupMockFetchSequence([
        { status: 400, body: { error: 'no note' } },
        { body: { document: '2024ApJ...123..456A', note: { content: 'My new note' } } }
      ]);

      const result = await manageAnnotation(client, {
        library_id: 'lib1',
        bibcode: '2024ApJ...123..456A',
        content: 'My new note',
        response_format: ResponseFormat.MARKDOWN
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);

      const [probeUrl, probeInit] = mockFetch.mock.calls[0];
      expect(probeUrl).toContain('biblib/notes/lib1/2024ApJ...123..456A');
      expect(probeInit.method).toBe('GET');

      const [writeUrl, writeInit] = mockFetch.mock.calls[1];
      expect(writeUrl).toContain('biblib/notes/lib1/2024ApJ...123..456A');
      expect(writeInit.method).toBe('POST');
      expect(JSON.parse(writeInit.body).content).toBe('My new note');

      expect(result).toContain('Annotation created successfully');
    });

    it('puts an update when the document already has a note', async () => {
      const mockFetch = setupMockFetchSequence([
        { body: { document: '2024ApJ...123..456A', note: { content: 'Old note' } } },
        { body: { document: '2024ApJ...123..456A', note: { content: 'My updated note' } } }
      ]);

      const result = await manageAnnotation(client, {
        library_id: 'lib1',
        bibcode: '2024ApJ...123..456A',
        content: 'My updated note',
        response_format: ResponseFormat.MARKDOWN
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);

      const [, writeInit] = mockFetch.mock.calls[1];
      expect(writeInit.method).toBe('PUT');
      expect(JSON.parse(writeInit.body).content).toBe('My updated note');

      expect(result).toContain('Annotation updated successfully');
    });
  });

  describe('deleteAnnotation', () => {
    it('should delete annotation', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      const result = await deleteAnnotation(client, {
        library_id: 'lib1',
        bibcode: '2024ApJ...123..456A',
        response_format: ResponseFormat.MARKDOWN
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/notes/lib1/2024ApJ...123..456A');
      expect(init.method).toBe('DELETE');

      expect(result).toContain('Annotation deleted successfully');
    });

    // Regression: the schema accepts any nonempty string and new URL() resolves
    // dot segments, so this bibcode turned an annotation delete into
    // DELETE biblib/documents/lib1 — the delete-library endpoint.
    it('refuses a bibcode that would retarget the request at another endpoint', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      await expect(
        deleteAnnotation(client, {
          library_id: 'lib1',
          bibcode: '../../../documents/lib1',
          response_format: ResponseFormat.MARKDOWN
        })
      ).rejects.toThrow(/Invalid bibcode/);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('refuses a library_id containing path delimiters', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      await expect(
        deleteAnnotation(client, {
          library_id: '../../documents/other',
          bibcode: '2024ApJ...123..456A',
          response_format: ResponseFormat.MARKDOWN
        })
      ).rejects.toThrow(/Invalid library_id/);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
