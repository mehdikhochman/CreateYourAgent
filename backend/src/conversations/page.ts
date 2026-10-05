/**
 * Cuts a page fetched newest first with `limit + 1` rows, and gives the
 * `before` cursor for the next page (rows strictly older than it).
 *
 * Rows that share the timestamp of the first row left out are moved to the
 * next page together, so `created_at < before` never skips one of them.
 */
export function cutPage<T>(
  rows: T[],
  limit: number,
  time: (row: T) => Date,
): { page: T[]; nextBefore: string | null } {
  const next = rows[limit];
  if (!next) return { page: rows, nextBefore: null };
  const boundary = time(next).getTime();
  const page = rows.slice(0, limit).filter((r) => time(r).getTime() !== boundary);
  if (page.length === 0) {
    // The whole page has one timestamp: can't do better than skipping the rest of it.
    return { page: rows.slice(0, limit), nextBefore: new Date(boundary).toISOString() };
  }
  return { page, nextBefore: new Date(boundary + 1).toISOString() };
}
