/**
 * ReactSortable writes `setList` with mutated clones: `chosen` / `selected`,
 * sometimes an index-only stub, sometimes the 120×120 thumb as width/height.
 * Composer thumbs and Post Preview both read `path` (and preview measures the
 * file). Reorder must only change order — never drop id/path/dimensions.
 */
export type MediaReorderItem = {
  id: string;
  path: string;
  alt?: string;
  thumbnail?: string;
  thumbnailTimestamp?: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
};

const SORTABLE_KEYS = new Set(['chosen', 'selected', 'filtered']);

function stripSortableFields<T extends MediaReorderItem>(item: T): T {
  const next = { ...item };
  for (const key of SORTABLE_KEYS) {
    delete next[key];
  }
  return next;
}

function hasPath(item: { path?: unknown } | null | undefined): boolean {
  return typeof item?.path === 'string' && item.path.length > 0;
}

/**
 * Rebuild the media array in `next`'s order, copying each row from `previous`
 * by id so Sortable's clone cannot blank a thumb or a preview frame.
 */
export function commitMediaOrder<T extends MediaReorderItem>(
  next: Array<Partial<T> | null | undefined> | null | undefined,
  previous: T[] | null | undefined
): T[] {
  const prev = (previous ?? []).filter((item): item is T => !!item?.id);
  const byId = new Map(prev.map((item) => [String(item.id), item]));
  const seen = new Set<string>();
  const ordered: T[] = [];

  for (const item of next ?? []) {
    if (!item || item.id == null || item.id === '') {
      continue;
    }
    const id = String(item.id);
    if (seen.has(id)) {
      continue;
    }
    const original = byId.get(id);
    const cleanNext = stripSortableFields(item as T);
    // Previous row wins field-for-field. Sortable clones omit path or stamp
    // the 120px thumb as width/height; spreading those blanks thumbs and
    // locks Post Preview to the 4:5 fallback.
    let merged: T | undefined;
    if (original && hasPath(original)) {
      merged = stripSortableFields(original);
    } else if (original && hasPath(cleanNext)) {
      merged = stripSortableFields({ ...original, path: cleanNext.path });
    } else if (hasPath(cleanNext)) {
      merged = cleanNext;
    }
    if (!merged?.id || !hasPath(merged)) {
      continue;
    }
    seen.add(id);
    ordered.push(merged);
  }

  if (ordered.length === 0) {
    return prev.filter(hasPath);
  }

  for (const item of prev) {
    const id = String(item.id);
    if (!seen.has(id) && hasPath(item)) {
      ordered.push(item);
    }
  }

  return ordered;
}

export function mediaOrderUnchanged<T extends { id?: string; path?: string }>(
  a: T[] | null | undefined,
  b: T[] | null | undefined
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (item, index) =>
      item?.id === right[index]?.id && item?.path === right[index]?.path
  );
}
