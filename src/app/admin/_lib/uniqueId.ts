/**
 * Return `base` if free, else append `_2`, `_3`, … until it doesn't collide
 * with `existing`. Used by the catalog editors when minting a fresh id/key
 * for a newly created row so a save never dead-ends on a duplicate.
 */
export function uniqueId(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}
