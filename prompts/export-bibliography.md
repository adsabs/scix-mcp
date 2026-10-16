# SciX Bibliography Export Guide

## Export Tool Overview

The `export` tool generates formatted citations from bibcodes in various academic formats, with support for custom formatting templates.

## Discovering Available Formats

**Use the /manifest endpoint** to get a complete list of available export formats:
- The manifest returns all supported formats with metadata
- Formats include type (text, XML, HTML, LaTeX, tagged, custom)
- Each format has a route, extension, and name

## All Available Export Formats

**Standard Formats (25+ options):**
- `bibtex` - BibTeX format for LaTeX
- `bibtexabs` - BibTeX with abstracts
- `aastex` - American Astronomical Society (AAS) format
- `ads` - ADS tagged format
- `endnote` - EndNote reference manager
- `procite` - ProCite format
- `ris` - RIS format (Reference Manager)
- `refworks` - RefWorks format
- `medlars` - MEDLARS format for medical literature
- `dcxml` - Dublin Core XML
- `refxml` - Reference XML
- `refabsxml` - Reference XML with abstracts
- `jatsxml` - JATS XML format
- `votable` - VOTable XML format
- `rss` - RSS feed format
- `mnras` - Monthly Notices RAS format
- `soph` - Solar Physics format
- `icarus` - Icarus journal format
- `ams` - American Meteorological Society
- `agu` - American Geophysical Union
- `gsa` - Geological Society of America
- `ieee` - IEEE format
- `custom` - **Custom format with printf-like syntax**

## Basic Usage

```
export(
  bibcodes=["2023ApJ...950..123S", "2022MNRAS.517.1234T"],
  format="bibtex"
)
```

Returns plain text in the chosen format, ready to paste into your bibliography.

## Custom Format Syntax

Create **custom bibliography formats** using printf-like field specifiers:

### Field Specifiers

- `%R` - Bibcode
- `%A` - Author list
- `%l` - Last name of first author
- `%Y` - Year
- `%T` - Title
- `%j` - Journal (formatted)
- `%J` - Journal (full name)
- `%V` - Volume
- `%p` - Page or article ID
- `%G` - Author list (surname, initials)
- `%u` - URL to the record's abstract page

### Encoding Options

- `%ZEncoding:unicode` - Unicode encoding (default)
- `%ZEncoding:html` - HTML entities
- `%ZEncoding:latex` - LaTeX special characters
- `%ZEncoding:csv` - CSV-safe encoding

### Format Controls

- `%ZLinelength:80` - Set line wrap length
- `%ZHeader:"text"` - Add header line
- `%ZFooter:"text"` - Add footer line

### Custom Format Examples

**Simple reference list:**
```
export(
  bibcodes=["2023ApJ...950..123S"],
  format="custom",
  custom_format="%l (%Y), %j, %V, %p.\n"
)
```
Output: "Smith (2023), ApJ, 950, 123."

**CSV export:**
```
export(
  bibcodes=[...],
  format="custom",
  custom_format="%ZEncoding:csv %ZHeader:'Author,Year,Title,Journal'\n%G,%Y,%T,%J"
)
```

**LaTeX with hyperlinks:**
```
export(
  bibcodes=[...],
  format="custom",
  custom_format="\\item \\href{%u}{%R} %A: \\textit{%T,} %j,%V,%p (%Y)"
)
```

**Markdown list:**
```
export(
  bibcodes=[...],
  format="custom",
  custom_format="- **%l et al. (%Y)**: [%T](%u), *%j*, %V, %p\n"
)
```

## Advanced Export Parameters

Control author display and formatting:

**maxauthor**: Maximum number of authors to display (default: 200)
```
export(bibcodes=[...], format="aastex", maxauthor=3)
```

**authorcutoff**: Number of authors before using "et al."
```
export(bibcodes=[...], format="bibtex", authorcutoff=5)
```

**journalformat**: Journal name format
- `1` - Use AASTeX macros (\apj, \mnras, etc.)
- `2` - Use abbreviations (ApJ, MNRAS, etc.)
- `3` - Full journal names
```
export(bibcodes=[...], format="aastex", journalformat=1)
```

**keyformat**: BibTeX key format (for bibtex/bibtexabs)
- Template with %1H (first author), %Y (year), %zm (journal abbreviation)
```
export(bibcodes=[...], format="bibtex", keyformat="%1H%Y")
```

**sort**: Sort order for bibcodes
- Can use any valid sort field (e.g., "date desc", "first_author asc")
```
export(bibcodes=[...], format="bibtex", sort="date desc")
```

## Capacity

- Accepts 1-2000 bibcodes per request
- For larger bibliographies, split into batches
- Results are returned as plain text

## Workflow Examples

### Build Bibliography for Paper

1. Search for relevant papers:
   ```
   search(query="exoplanet detection methods year:2020-2024", rows=50)
   ```

2. Extract bibcodes from results

3. Export in desired format:
   ```
   export(bibcodes=[...], format="bibtex", journalformat=2)
   ```

4. Copy output to your LaTeX document

### Export Library Contents with Custom Format

1. Get library papers:
   ```
   get_library(library_id="...")
   ```

2. Extract bibcodes from library

3. Export with custom format for blog post:
   ```
   export(
     bibcodes=[...],
     format="custom",
     custom_format="- [%T](%u) by %A (%Y)\n",
     sort="date desc"
   )
   ```

### Create Bibliography from Citation Network

1. Start with key paper
2. Get references and citations:
   ```
   get_references(bibcode="...")
   get_citations(bibcode="...")
   ```

3. Combine bibcodes from both
4. Export merged list with author limit:
   ```
   export(bibcodes=[...], format="aastex", maxauthor=10, authorcutoff=3)
   ```

### Export for Specific Journal Requirements

**ApJ submission:**
```
export(bibcodes=[...], format="aastex", journalformat=1)
```

**MNRAS submission:**
```
export(bibcodes=[...], format="mnras")
```

**IEEE paper:**
```
export(bibcodes=[...], format="ieee")
```

## Format-Specific Tips

### BibTeX / BibTeXabs

- Most common for LaTeX users
- Automatically generates cite keys (customize with keyformat)
- Compatible with BibLaTeX
- Use `bibtexabs` to include abstracts

### AASTeX

- Required for AAS journal submissions (ApJ, AJ, ApJS, etc.)
- Uses `\bibitem` format
- Set `journalformat=1` for AASTeX journal macros

### EndNote / ProCite / RIS / RefWorks

- Import directly into reference managers
- Preserves all metadata
- Good for non-LaTeX workflows
- Each tool has its own preferred format

### XML Formats (JATS, Dublin Core, VOTable)

- Structured metadata export
- Machine-readable
- Good for data processing pipelines
- JATS XML common for journal publishing systems

### Custom Format

- **Maximum flexibility** for any output style
- Supports all field specifiers
- Can generate markdown, HTML, LaTeX, CSV, or plain text
- Perfect for journal styles not in standard formats
- Use encoding options to ensure proper character handling

## Integration with Libraries

**Best practice:** Create a library for your paper, then export:

1. `create_library(name="Paper Bibliography")`
2. Add papers via search or manual selection
3. Review and annotate
4. Export when ready to cite (with custom format if needed)
5. Update library as paper evolves

This workflow ensures you can track which papers you've reviewed and re-export as needed.

## Performance Tips

- Batch export requests when possible
- Cache exported bibliographies locally
- Use libraries to organize papers before exporting
- Consider response size for very large bibliographies (2000 papers)
- Use custom format instead of post-processing output when possible