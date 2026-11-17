/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import picomatch from 'picomatch';

interface CachedBatch {
  files: string[];
  /**
   * Fetch limit for a bounded fuzzy batch. `files.length === limit` means
   * the batch may be truncated. Omitted for complete (glob/filter) results.
   */
  limit?: number;
}

/**
 * Implements an in-memory cache for file search results.
 * This cache optimizes subsequent searches by leveraging previously computed results.
 */
export class ResultCache {
  private readonly cache: Map<string, CachedBatch>;
  private hits = 0;
  private misses = 0;

  constructor(private readonly allFiles: string[]) {
    this.cache = new Map();
  }

  /**
   * Retrieves cached search results for a given query, or provides a base set
   * of files to search from.
   * @param query The search query pattern.
   * @returns An object containing the files to search and a boolean indicating
   *          if the result is an exact cache hit.
   */
  async get(query: string): Promise<{
    files: string[];
    isExactMatch: boolean;
    limit?: number;
  }> {
    const cached = this.cache.get(query);

    if (cached) {
      this.hits++;
      return {
        files: cached.files,
        isExactMatch: true,
        limit: cached.limit,
      };
    }

    this.misses++;

    // This is the core optimization of the memory cache.
    // If a user first searches for "foo", and then for "foobar",
    // we don't need to search through all files again. We can start
    // from the results of the "foo" search.
    // This finds the most specific, already-cached query that is a prefix
    // of the current query.
    let bestBaseQuery = '';
    if (!hasGlobSyntax(query)) {
      for (const key of this.cache?.keys?.() ?? []) {
        if (
          !hasGlobSyntax(key) &&
          query.startsWith(key) &&
          key.length > bestBaseQuery.length
        ) {
          bestBaseQuery = key;
        }
      }
    }

    const filesToSearch = bestBaseQuery
      ? this.cache.get(bestBaseQuery)!.files
      : this.allFiles;

    return { files: filesToSearch, isExactMatch: false };
  }

  /**
   * Stores search results in the cache.
   * @param query The search query pattern.
   * @param results The matching file paths to cache.
   * @param limit Fetch limit for a bounded fuzzy batch. Omit when `results`
   * is the complete match set.
   */
  set(query: string, results: string[], limit?: number): void {
    this.cache.set(query, { files: results, limit });
  }
}

function hasGlobSyntax(query: string): boolean {
  return picomatch.scan(query).isGlob;
}
