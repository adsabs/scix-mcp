# SciX Library Management Guide

## What are Libraries?

Libraries are personal collections of papers with optional annotations. They're perfect for organizing research, building reading lists, or curating bibliographies.

## Core Library Operations

### Creating Libraries

```
create_library(
  name="My Research Collection",
  description="Papers on exoplanet detection methods",
  public=false,
  bibcodes=["2023ApJ...950..123S", "2022MNRAS.517.1234T"]
)
```

Returns a `library_id` needed for all other operations.

### Listing and Viewing

```
get_libraries(type="owner")  # List your libraries
get_library(library_id="...")  # View library contents
```

### Editing Metadata

```
edit_library(
  library_id="...",
  name="Updated Name",
  description="New description",
  public=true
)
```

## Document Management

### Adding/Removing Papers

```
manage_documents(
  library_id="...",
  bibcodes=["2023ApJ...950..123S"],
  action="add"
)
```

Operations are idempotent - adding existing documents is safe.

### Bulk Add from Search

```
add_documents_by_query(
  library_id="...",
  query="author:\"Smith, J.\" year:2023",
  rows=25
)
```

Perfect for "add all papers by author X" scenarios.

## Library Operations

### Set Operations

```
library_operation(
  library_id="first_id",
  operation="union",
  source_library_ids=["lib2", "lib3"],
  name="Merged Library",
  description="Union of three reading lists"
)
```

Available operations:
- `union` - Combine libraries (OR)
- `intersection` - Common papers (AND)
- `difference` - Papers in the primary library not in the others
- `copy` - Copy documents into the library named in `source_library_ids`
- `empty` - Remove all documents (keep library)

`name`, `description`, and `public` apply only to `union`, `intersection`,
and `difference`, which create a new library.

## Annotations

Add research notes to papers within a library context:

```
manage_annotation(
  library_id="...",
  bibcode="2023ApJ...950..123S",
  content="Important findings: ..."
)
```

Annotations are per-document and specific to each library.

## Sharing and Permissions

### View Permissions

```
get_permissions(library_id="...")
```

### Grant Access

```
update_permissions(
  library_id="...",
  email="colleague@university.edu",
  permission="read"  # or "write", "admin", "none" to revoke
)
```

### Transfer Ownership

```
transfer_library(
  library_id="...",
  email="new_owner@university.edu"
)
```

### Public Sharing

Public libraries can be shared at:
`https://scixplorer.org/public-libraries/<library_id>`

## Example Workflows

**Building a reading list:**
1. `create_library(name="Reading List - Exoplanets")`
2. `add_documents_by_query(query="exoplanet detection year:2023-2024")`
3. `manage_annotation` for each paper after reading

**Collaborative research collection:**
1. `create_library(name="Team Project", public=false)`
2. Add initial papers
3. `update_permissions` to grant team access
4. Share library URL with team