/**
 * Two-step continue pickers (YouTube, Facebook pages, …) change shape with
 * how many options there are. One lonely card in a grid looks empty; a grid
 * of twenty is unreadable. These cutoffs are the same idea as
 * ChannelPickList's search threshold (8): few enough to scan as cards, more
 * than that becomes a searchable list.
 */
export const CONTINUE_PICKER_GRID_MAX = 8;

export type ContinuePickerDensity = 'confirm' | 'grid' | 'list';

export function continuePickerDensity(count: number): ContinuePickerDensity {
  if (count === 1) {
    return 'confirm';
  }
  if (count > CONTINUE_PICKER_GRID_MAX) {
    return 'list';
  }
  return 'grid';
}

export function continuePickerSearchText(item: unknown): string {
  if (!item || typeof item !== 'object') {
    return '';
  }
  return Object.values(item as Record<string, unknown>)
    .filter(
      (value): value is string | number =>
        typeof value === 'string' || typeof value === 'number'
    )
    .join(' ');
}

export function filterContinuePickerItems<T>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return items;
  }
  return items.filter((item) =>
    continuePickerSearchText(item).toLowerCase().includes(q)
  );
}
