import { SciXAPIClient, SciXAPIError } from '../client.js';
import {
  GetLibrariesInput,
  GetLibraryInput,
  CreateLibraryInput,
  DeleteLibraryInput,
  EditLibraryInput,
  ManageDocumentsInput,
  AddDocumentsByQueryInput,
  LibraryOperationInput,
  GetPermissionsInput,
  UpdatePermissionsInput,
  TransferLibraryInput,
  GetAnnotationInput,
  ManageAnnotationInput,
  DeleteAnnotationInput,
  ResponseFormat,
  LibraryOperation,
  DocumentAction,
  LibraryMetadata,
  LibraryMetadataResponse,
  GetLibraryResponse,
  LibrariesListResponse,
  DocumentUpdateResponse,
  LibraryOperationResponse,
  PermissionsResponse,
  Annotation,
  SolrResponse
} from '../types.js';

export async function getLibraries(
  client: SciXAPIClient,
  input: GetLibrariesInput
): Promise<string> {
  const params: Record<string, unknown> = {};

  if (input.type !== 'all') {
    params.access_type = input.type;
  }

  const data = await client.get<LibrariesListResponse>('biblib/libraries', params);
  const libraries: LibraryMetadata[] = data.libraries || [];

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify(libraries, null, 2);
  }

  if (libraries.length === 0) {
    return 'No libraries found.';
  }

  let output = `# Libraries (${libraries.length})\n\n`;

  for (const lib of libraries) {
    output += `## ${lib.name}\n`;
    output += `- **ID**: ${lib.id}\n`;
    output += `- **Description**: ${lib.description || 'No description'}\n`;
    output += `- **Documents**: ${lib.num_documents}\n`;
    output += `- **Owner**: ${lib.owner}\n`;
    output += `- **Permission**: ${lib.permission}\n`;
    output += `- **Public**: ${lib.public ? 'Yes' : 'No'}\n`;
    output += `- **Collaborators**: ${lib.num_users}\n`;
    output += `- **Created**: ${lib.date_created}\n`;
    output += `- **Modified**: ${lib.date_last_modified}\n\n`;
  }

  return output;
}

export async function getLibrary(
  client: SciXAPIClient,
  input: GetLibraryInput
): Promise<string> {
  const data = await client.get<GetLibraryResponse>(`biblib/libraries/${input.library_id}`);
  const library = data.metadata ?? data;
  const documents: string[] = data.documents || [];

  if (!library || !library.name) {
    throw new Error('Unexpected get_library response: missing library metadata');
  }

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify({ metadata: library, documents }, null, 2);
  }

  let output = `# ${library.name}\n\n`;
  output += `## Metadata\n`;
  output += `- **ID**: ${library.id}\n`;
  output += `- **Description**: ${library.description || 'No description'}\n`;
  output += `- **Owner**: ${library.owner}\n`;
  output += `- **Permission**: ${library.permission}\n`;
  output += `- **Public**: ${library.public ? 'Yes' : 'No'}\n`;
  output += `- **Collaborators**: ${library.num_users}\n`;
  output += `- **Created**: ${library.date_created}\n`;
  output += `- **Modified**: ${library.date_last_modified}\n\n`;

  output += `## Documents (${documents.length})\n\n`;
  if (documents.length > 0) {
    for (const bibcode of documents) {
      output += `- ${bibcode}\n`;
    }
  } else {
    output += 'No documents in library.\n';
  }

  return output;
}

export async function createLibrary(
  client: SciXAPIClient,
  input: CreateLibraryInput
): Promise<string> {
  const payload: Record<string, unknown> = {
    name: input.name,
    description: input.description || '',
    public: input.public
  };

  if (input.bibcodes && input.bibcodes.length > 0) {
    payload.bibcodes = input.bibcodes;
  }

  const data = await client.post<LibraryMetadataResponse>('biblib/libraries', payload);
  const library = data.metadata ?? data;

  if (!library || !library.name) {
    throw new Error('Unexpected create_library response: missing library metadata');
  }

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify(library, null, 2);
  }

  return `Library created successfully!\n\n` +
    `**Name**: ${library.name}\n` +
    `**ID**: ${library.id}\n` +
    `**Documents**: ${library.num_documents}\n` +
    `**Created**: ${library.date_created}`;
}

export async function deleteLibrary(
  client: SciXAPIClient,
  input: DeleteLibraryInput
): Promise<string> {
  // SciX uses the documents endpoint for destructive library operations
  await client.delete(`biblib/documents/${input.library_id}`);

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify({ success: true, library_id: input.library_id }, null, 2);
  }

  return `Library ${input.library_id} deleted successfully.`;
}

export async function editLibrary(
  client: SciXAPIClient,
  input: EditLibraryInput
): Promise<string> {
  const payload: Record<string, unknown> = {};

  if (input.name !== undefined) {
    payload.name = input.name;
  }
  if (input.description !== undefined) {
    payload.description = input.description;
  }
  if (input.public !== undefined) {
    payload.public = input.public;
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('Provide at least one field to update (name, description, or public).');
  }

  // ADS/SciX expects metadata updates on the documents endpoint, not libraries
  const data = await client.put<LibraryMetadataResponse>(`biblib/documents/${input.library_id}`, payload);
  const library = data.metadata ?? data;

  if (!library || !library.name) {
    throw new Error('Unexpected edit_library response: missing library metadata');
  }

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify(library, null, 2);
  }

  return `Library updated successfully!\n\n` +
    `**Name**: ${library.name}\n` +
    `**Description**: ${library.description || 'No description'}\n` +
    `**Public**: ${library.public ? 'Yes' : 'No'}\n` +
    `**Modified**: ${library.date_last_modified}`;
}

export async function manageDocuments(
  client: SciXAPIClient,
  input: ManageDocumentsInput
): Promise<string> {
  // ADS/SciX expects `bibcode` key and document ops on /biblib/documents/{id}
  const payload = {
    bibcode: input.bibcodes,
    action: input.action
  };

  const data = await client.post<DocumentUpdateResponse>(
    `biblib/documents/${input.library_id}`,
    payload
  );

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify(data, null, 2);
  }

  const action = input.action === DocumentAction.ADD ? 'added to' : 'removed from';
  return `${input.bibcodes.length} documents ${action} library successfully.\n` +
    `**Total documents**: ${data.number_added || data.number_removed || 0}`;
}

export async function addDocumentsByQuery(
  client: SciXAPIClient,
  input: AddDocumentsByQueryInput
): Promise<string> {
  const payload = { query: input.query, rows: input.rows };

  try {
    const data = await client.post<DocumentUpdateResponse>(
      `biblib/documents/${input.library_id}/query`,
      payload
    );

    if (input.response_format === ResponseFormat.JSON) {
      return JSON.stringify(data, null, 2);
    }

    return `Documents added to library from query.\n\n` +
      `**Query**: ${input.query}\n` +
      `**Documents added**: ${data.number_added || 0}`;
  } catch (error: unknown) {
    const isNotFound = error instanceof SciXAPIError && error.status === 404;

    if (!isNotFound) {
      throw error;
    }
  }

  const searchData = await client.get<SolrResponse>('search/query', {
    q: input.query,
    rows: input.rows,
    fl: 'bibcode',
    start: 0
  });

  const docs = searchData?.response?.docs ?? [];
  const bibcodes = docs
    .map((doc) => doc.bibcode)
    .filter((bibcode): bibcode is string => typeof bibcode === 'string' && bibcode.length > 0);

  if (bibcodes.length === 0) {
    const message = `No documents found for query '${input.query}'.`;
    return input.response_format === ResponseFormat.JSON
      ? JSON.stringify({ query: input.query, added: 0, found: 0, library_id: input.library_id }, null, 2)
      : message;
  }

  const data = await client.post<DocumentUpdateResponse>(
    `biblib/documents/${input.library_id}`,
    {
      bibcode: bibcodes,
      action: DocumentAction.ADD
    }
  );

  const added = data?.number_added ?? bibcodes.length;

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify({
      query: input.query,
      library_id: input.library_id,
      requested: input.rows,
      found: bibcodes.length,
      added
    }, null, 2);
  }

  return `Documents added to library from query (search fallback).\n\n` +
    `**Query**: ${input.query}\n` +
    `**Results found**: ${bibcodes.length}\n` +
    `**Documents added**: ${added}`;
}

export async function libraryOperation(
  client: SciXAPIClient,
  input: LibraryOperationInput
): Promise<string> {
  const payload: Record<string, unknown> = {
    action: input.operation
  };

  if (input.source_library_ids && input.source_library_ids.length > 0) {
    payload.libraries = input.source_library_ids;
  }

  if (input.operation === LibraryOperation.COPY) {
    if (input.name) payload.name = input.name;
    if (input.description) payload.description = input.description;
  }

  const data = await client.post<LibraryOperationResponse>(
    `biblib/libraries/operations/${input.library_id}`,
    payload
  );

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify(data, null, 2);
  }

  let output = `Library operation '${input.operation}' completed successfully.\n\n`;

  if (data.library_id) {
    output += `**New Library ID**: ${data.library_id}\n`;
  }
  if (data.number_added !== undefined) {
    output += `**Documents affected**: ${data.number_added}\n`;
  }

  return output;
}

export async function getPermissions(
  client: SciXAPIClient,
  input: GetPermissionsInput
): Promise<string> {
  const data = await client.get<PermissionsResponse>(`biblib/permissions/${input.library_id}`);

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify(data, null, 2);
  }

  let output = `# Library Permissions\n\n`;

  if (data.owner) {
    output += `**Owner**: ${data.owner}\n\n`;
  }

  if (data.collaborators && Object.keys(data.collaborators).length > 0) {
    output += `## Collaborators\n\n`;
    for (const [email, permissions] of Object.entries(data.collaborators)) {
      output += `- **${email}**: ${permissions.join(', ')}\n`;
    }
  } else {
    output += 'No collaborators.\n';
  }

  return output;
}

export async function updatePermissions(
  client: SciXAPIClient,
  input: UpdatePermissionsInput
): Promise<string> {
  const payload = {
    email: input.email,
    permission: input.permission
  };

  const data = await client.post(`biblib/permissions/${input.library_id}`, payload);

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify(data, null, 2);
  }

  return `Permissions updated successfully.\n\n` +
    `**User**: ${input.email}\n` +
    `**Permission**: ${input.permission}`;
}

export async function transferLibrary(
  client: SciXAPIClient,
  input: TransferLibraryInput
): Promise<string> {
  const payload = {
    email: input.email
  };

  const data = await client.post(`biblib/transfer/${input.library_id}`, payload);

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify(data, null, 2);
  }

  return `Library transferred successfully to ${input.email}.`;
}

export async function getAnnotation(
  client: SciXAPIClient,
  input: GetAnnotationInput
): Promise<string> {
  const annotation = await client.get<Annotation>(
    `biblib/libraries/${input.library_id}/notes/${input.bibcode}`
  );

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify(annotation, null, 2);
  }

  if (!annotation || !annotation.content) {
    return `No annotation found for ${input.bibcode}.`;
  }

  return `# Annotation for ${input.bibcode}\n\n` +
    `${annotation.content}\n\n` +
    `---\n` +
    `*Created*: ${annotation.date_created}\n` +
    `*Modified*: ${annotation.date_last_modified}`;
}

export async function manageAnnotation(
  client: SciXAPIClient,
  input: ManageAnnotationInput
): Promise<string> {
  const payload = {
    content: input.content
  };

  const data = await client.post(`biblib/libraries/${input.library_id}/notes/${input.bibcode}`, payload);

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify(data, null, 2);
  }

  return `Annotation saved successfully for ${input.bibcode}.`;
}

export async function deleteAnnotation(
  client: SciXAPIClient,
  input: DeleteAnnotationInput
): Promise<string> {
  await client.delete(`biblib/libraries/${input.library_id}/notes/${input.bibcode}`);

  if (input.response_format === ResponseFormat.JSON) {
    return JSON.stringify({ success: true, bibcode: input.bibcode }, null, 2);
  }

  return `Annotation deleted successfully for ${input.bibcode}.`;
}
