// shortcut: in-memory and never evicted, emptied on restart; move to a database when scheduled checks arrive.
const store = new Map<string, { exp: number; val: Promise<unknown> }>();

export function cached<T>(key: string, ttlMs: number, fresh: boolean, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && !fresh && hit.exp > Date.now()) return hit.val as Promise<T>;
  const val = fn();
  store.set(key, { exp: Date.now() + ttlMs, val });
  val.catch(() => store.get(key)?.val === val && store.delete(key)); // never cache failures
  return val;
}

export const HOUR = 3600_000;
