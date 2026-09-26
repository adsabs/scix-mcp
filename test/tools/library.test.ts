import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SciXAPIClient } from '../../src/client.js';
import { setupMockFetch, restoreFetch } from '../helpers/mockFetch.js';
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
import { ResponseFormat, DocumentAction, LibraryOperation } from '../../src/types.js';

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
      expect(body.bibcodes).toEqual(['bibcode1', 'bibcode2']);

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
      expect(body.bibcodes).toBeUndefined();
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
    it('should add documents by query', async () => {
      const mockResponse = { number_added: 15 };
      const mockFetch = setupMockFetch({ body: mockResponse });

      const result = await addDocumentsByQuery(client, {
        library_id: 'lib1',
        query: 'author:"Einstein"',
        rows: 20,
        response_format: ResponseFormat.MARKDOWN
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/documents/lib1/query');

      const body = JSON.parse(init.body);
      expect(body.query).toBe('author:"Einstein"');
      expect(body.rows).toBe(20);

      expect(result).toContain('Documents added to library');
      expect(result).toContain('15');
    });

    it('should fall back to search when query endpoint returns 404', async () => {
      const searchResponse = {
        response: { docs: [{ bibcode: 'bib1' }, { bibcode: 'bib2' }] }
      };
      const addResponse = { number_added: 2 };

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({}),
          text: async () => ''
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => searchResponse,
          text: async () => JSON.stringify(searchResponse)
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => addResponse,
          text: async () => JSON.stringify(addResponse)
        } as any);

      global.fetch = mockFetch as any;

      const result = await addDocumentsByQuery(client, {
        library_id: 'lib1',
        query: 'black hole',
        rows: 2,
        response_format: ResponseFormat.MARKDOWN
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[0][0]).toContain('biblib/documents/lib1/query');
      expect(mockFetch.mock.calls[1][0]).toContain('search/query');
      expect(mockFetch.mock.calls[2][0]).toContain('biblib/documents/lib1');
      expect(result).toContain('Documents added');
      expect(result).toContain('2');
    });

    it('should not fall back when a non-404 error message merely contains "not found"', async () => {
      // The fallback is status-driven: a 500 saying "not found" must not
      // trigger it, only a genuine 404 should.
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map(),
        json: async () => ({ error: 'query endpoint not found in upstream' }),
        text: async () => JSON.stringify({ error: 'query endpoint not found in upstream' })
      } as any);

      global.fetch = mockFetch as any;

      await expect(
        addDocumentsByQuery(client, {
          library_id: 'lib1',
          query: 'black hole',
          rows: 2,
          response_format: ResponseFormat.MARKDOWN
        })
      ).rejects.toThrow();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toContain('biblib/documents/lib1/query');
    });

    it('should respond gracefully when search finds no documents', async () => {
      const searchResponse = { response: { docs: [] } };

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({}),
          text: async () => ''
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => searchResponse,
          text: async () => JSON.stringify(searchResponse)
        } as any);

      global.fetch = mockFetch as any;

      const result = await addDocumentsByQuery(client, {
        library_id: 'lib1',
        query: 'noresults',
        rows: 5,
        response_format: ResponseFormat.MARKDOWN
      });

      expect(result).toContain("No documents found for query 'noresults'");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('libraryOperation', () => {
    it('should perform union operation', async () => {
      const mockResponse = { library_id: 'newlib', number_added: 25 };
      const mockFetch = setupMockFetch({ body: mockResponse });

      const result = await libraryOperation(client, {
        library_id: 'lib1',
        operation: LibraryOperation.UNION,
        source_library_ids: ['lib2', 'lib3'],
        response_format: ResponseFormat.MARKDOWN
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/libraries/operations/lib1');

      const body = JSON.parse(init.body);
      expect(body.action).toBe('union');
      expect(body.libraries).toEqual(['lib2', 'lib3']);

      expect(result).toContain('union');
      expect(result).toContain('newlib');
    });

    it('should perform copy operation with name and description', async () => {
      const mockResponse = { library_id: 'copied-lib' };
      const mockFetch = setupMockFetch({ body: mockResponse });

      await libraryOperation(client, {
        library_id: 'lib1',
        operation: LibraryOperation.COPY,
        name: 'Copy of Library',
        description: 'Copied library',
        response_format: ResponseFormat.MARKDOWN
      });

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.action).toBe('copy');
      expect(body.name).toBe('Copy of Library');
      expect(body.description).toBe('Copied library');
    });

    it('should perform empty operation', async () => {
      const mockResponse = { number_added: 0 };
      setupMockFetch({ body: mockResponse });

      await libraryOperation(client, {
        library_id: 'lib1',
        operation: LibraryOperation.EMPTY,
        response_format: ResponseFormat.MARKDOWN
      });

      // Empty operation doesn't need source libraries
      expect(true).toBe(true);
    });
  });

  describe('getPermissions', () => {
    it('should fetch permissions', async () => {
      const mockData = {
        owner: 'owner@example.com',
        collaborators: {
          'user1@example.com': ['read'],
          'user2@example.com': ['read', 'write']
        }
      };

      const mockFetch = setupMockFetch({ body: mockData });

      const result = await getPermissions(client, {
        library_id: 'lib1',
        response_format: ResponseFormat.MARKDOWN
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/permissions/lib1');

      expect(result).toContain('owner@example.com');
      expect(result).toContain('user1@example.com');
      expect(result).toContain('read, write');
    });
  });

  describe('updatePermissions', () => {
    it('should update permissions', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      const result = await updatePermissions(client, {
        library_id: 'lib1',
        email: 'user@example.com',
        permission: 'write',
        response_format: ResponseFormat.MARKDOWN
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/permissions/lib1');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body);
      expect(body.email).toBe('user@example.com');
      expect(body.permission).toBe('write');

      expect(result).toContain('Permissions updated successfully');
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
    it('should fetch annotation', async () => {
      const mockData = {
        id: 'note1',
        bibcode: '2024ApJ...123..456A',
        content: 'This is my note',
        date_created: '2024-01-01',
        date_last_modified: '2024-01-02'
      };

      const mockFetch = setupMockFetch({ body: mockData });

      const result = await getAnnotation(client, {
        library_id: 'lib1',
        bibcode: '2024ApJ...123..456A',
        response_format: ResponseFormat.MARKDOWN
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/libraries/lib1/notes/2024ApJ...123..456A');

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
  });

  describe('manageAnnotation', () => {
    it('should save annotation', async () => {
      const mockFetch = setupMockFetch({ body: {} });

      const result = await manageAnnotation(client, {
        library_id: 'lib1',
        bibcode: '2024ApJ...123..456A',
        content: 'My updated note',
        response_format: ResponseFormat.MARKDOWN
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('biblib/libraries/lib1/notes/2024ApJ...123..456A');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body);
      expect(body.content).toBe('My updated note');

      expect(result).toContain('Annotation saved successfully');
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
      expect(url).toContain('biblib/libraries/lib1/notes/2024ApJ...123..456A');
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
