import { sortFieldToOrderBy } from './sqlite-query-builder.js';

/**
 * Shared pagination algorithm for filtered infinite scroll — the one place
 * that knows how to accumulate JS-verified matches across chunks without ever
 * skipping a match when a page is truncated mid-chunk (resuming from the
 * chunk's raw scan position instead of the last returned match would drop the
 * matches between them).
 *
 * `fetchChunk` is injected so this exact algorithm can run against the real
 * worker (db.js, via postMessage dispatch) or directly against an in-memory
 * db (tests, via sqlite-schema.js's searchChunk) — same code path either way,
 * so a test against this function is a test against what actually ships.
 *
 * fetchChunk(orderBy, cursor, chunkSize) => Promise<{ entries, nextCursor, exhausted }>
 * applyFilter(spin, filters, gameConfig) => boolean — the real per-row correctness check
 */
export async function paginateFilteredSearch(
  fetchChunk,
  {
    filters,
    gameConfig,
    sortField,
    cursor = null,
    pageSize = 1000,
    signal = null,
    applyFilter,
    chunkSize = 1500,
  },
) {
  const orderBy = sortFieldToOrderBy(sortField);
  const entries = [];
  let cur = cursor;
  let exhausted = false;
  let truncated = false;

  while (true) {
    if (signal?.aborted) break;

    const chunk = await fetchChunk(orderBy, cur, chunkSize);

    for (const spin of chunk.entries) {
      if (applyFilter(spin, filters, gameConfig)) {
        entries.push(spin);
        if (entries.length >= pageSize) {
          truncated = true;
          break;
        }
      }
    }

    if (truncated) {
      // Resume exactly after the last entry we're actually returning — not
      // the chunk's raw scan position — so the remainder of this chunk's
      // matches (beyond pageSize) aren't skipped on the next call.
      const last = entries[entries.length - 1];
      cur = {
        afterVal: orderBy.column === 'num' ? last.num : last[orderBy.column],
        afterNum: last.num,
      };
      exhausted = false;
      break;
    }

    cur = chunk.nextCursor;
    exhausted = chunk.exhausted;
    if (exhausted || signal?.aborted) break;

    await new Promise((r) => setTimeout(r, 0)); // yield to the UI thread between chunks
  }

  return { entries, nextCursor: exhausted ? null : cur, exhausted };
}
