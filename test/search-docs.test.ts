import { describe, it, expect, beforeAll } from "vitest";
import { searchDocs } from "../src/search-docs.js";

const MAX_SNIPPET_LENGTH = 260;

describe("searchDocs", () => {
  beforeAll(async () => {
    // Warms the lazily-built MiniSearch index so the first real assertion
    // isn't timing index construction.
    await searchDocs("search", 1);
  });

  it("should return results for author search query", async () => {
    const results = await searchDocs("author search", 5);

    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);

    const firstResult = results[0];
    expect(firstResult).toHaveProperty("id");
    expect(firstResult).toHaveProperty("title");
    expect(firstResult).toHaveProperty("snippet");
    expect(firstResult).toHaveProperty("score");
  });

  it("should return results for export bibtex query", async () => {
    const results = await searchDocs("export bibtex", 5);

    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBeGreaterThan(0);

    const hasRelevantResult = results.some(
      (r) =>
        r.snippet.toLowerCase().includes("export") ||
        r.snippet.toLowerCase().includes("bibtex")
    );
    expect(hasRelevantResult).toBe(true);
  });

  it("should return results for library create query", async () => {
    const results = await searchDocs("library create", 5);

    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBeGreaterThan(0);

    const hasRelevantResult = results.some(
      (r) =>
        r.snippet.toLowerCase().includes("library") ||
        r.snippet.toLowerCase().includes("create")
    );
    expect(hasRelevantResult).toBe(true);
  });

  it("should limit results to specified number", async () => {
    const results = await searchDocs("search", 3);

    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("should return empty array for empty query", async () => {
    const results = await searchDocs("", 10);

    expect(results).toEqual([]);
  });

  it("should return empty array for whitespace query", async () => {
    const results = await searchDocs("   ", 10);

    expect(results).toEqual([]);
  });

  it("should handle fuzzy matching for typos", async () => {
    const results = await searchDocs("authr serch", 5);

    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBeGreaterThan(0);
  });

  it("should include all required fields in results", async () => {
    const results = await searchDocs("bibcode", 1);

    expect(results.length).toBeGreaterThan(0);

    const result = results[0];
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("section");
    expect(result).toHaveProperty("subsection");
    expect(result).toHaveProperty("source_file");
    expect(result).toHaveProperty("source_url");
    expect(result).toHaveProperty("doc_type");
    expect(result).toHaveProperty("category");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("snippet");

    expect(typeof result.id).toBe("string");
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThan(0);
  });
});

describe("snippet generation", () => {
  it("should generate snippets centered on search terms", async () => {
    const results = await searchDocs("citation_count", 5);

    expect(results.length).toBeGreaterThan(0);

    const hasRelevantSnippet = results.some((r) =>
      r.snippet.toLowerCase().includes("citation")
    );
    expect(hasRelevantSnippet).toBe(true);
  });

  it("should truncate long content with ellipsis", async () => {
    const results = await searchDocs("library", 10);

    const longSnippets = results.filter(
      (r) =>
        r.snippet.length >= MAX_SNIPPET_LENGTH &&
        (r.snippet.startsWith("...") || r.snippet.endsWith("..."))
    );
    expect(longSnippets.length).toBeGreaterThan(0);
  });

  it("should keep snippets within expected length bounds", async () => {
    const results = await searchDocs("bibcode", 10);

    const allWithinBounds = results.every(
      (r) => r.snippet.length <= MAX_SNIPPET_LENGTH + 6
    );
    expect(allWithinBounds).toBe(true);
  });
});

describe("ranking and scoring", () => {
  it("should return results in descending score order", async () => {
    const results = await searchDocs("search bibcode author", 10);

    expect(results.length).toBeGreaterThan(1);

    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
    }
  });

  it("should boost title matches higher than content matches", async () => {
    const results = await searchDocs("syntax", 10);

    expect(results.length).toBeGreaterThan(0);

    const titleMatches = results.filter((r) =>
      r.title.toLowerCase().includes("syntax")
    );
    const nonTitleMatches = results.filter(
      (r) => !r.title.toLowerCase().includes("syntax")
    );

    if (titleMatches.length > 0 && nonTitleMatches.length > 0) {
      expect(titleMatches[0].score).toBeGreaterThan(
        nonTitleMatches[nonTitleMatches.length - 1].score
      );
    }
  });
});
